const { WebClient } = require('@slack/web-api');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');

const oldest = Math.floor(Date.now() / 1000) - (31 * 24 * 3600);
const latest = Math.floor(Date.now() / 1000);

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

const dbConfig = {
    host: 'localhost',
    user: 'root_user_yade',
    password: 'tanakalab_kankan',
    database: 'kankan_member',
    connectionLimit: 10
};

let pool;

async function connectDb() {
    try {
        pool = mysql.createPool(dbConfig);
        const connection = await pool.getConnection();
        connection.release();
    } catch (err) {
        process.exit(1);
    }
}

connectDb();

async function getSlackWebClient(userId) {
  if (!userId) {
    throw new Error('userID is required to get Slack token');
  }
  if (!pool) {
    throw new Error('Database pool is not initialized');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT slackToken FROM sys_users WHERE userID = ?',
      [userId]
    );

    if (rows.length > 0) {
    } else {
    }

    if (rows.length > 0 && rows[0].slackToken) {
      return new WebClient(rows[0].slackToken);
    } else {
      throw new Error(`Slack token not found for userID: ${userId}`);
    }
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

app.post('/slack', async (req, res) => {
  const { channel, text, userID } = req.body;

  if (!channel || !text) {
    return res.status(400).send('channel ID and text are required');
  }
  if (!userID) {
    return res.status(400).send('userID is required');
  }

  try {
    const web = await getSlackWebClient(userID);
    const result = await web.chat.postMessage({
      channel: channel,
      text: text,
    });

    res.status(200).send(`メッセージをチャンネル ${channel} に送信しました。`);
  } catch (error) {
    if (error.message.includes('Slack token not found') || error.message.includes('userID is required')) {
        return res.status(401).send(`Error: ${error.message}`);
    }
    res.status(500).send(`メッセージの送信中にエラーが発生しました: ${error.message}`);
  }
});

app.get('/slack', async (req, res) => {
  const { channel, text, userID } = req.query;

  if (!channel || !text) {
    return res.status(400).send('channel and text query parameters are required');
  }
  if (!userID) {
    return res.status(400).send('userID query parameter is required');
  }

  try {
    const web = await getSlackWebClient(userID);

    const historyResult = await web.conversations.history({
      channel: channel,
      oldest: oldest,
      latest: latest,
      inclusive: true,
      limit: 200
    });

    const targetMessage = historyResult.messages.find(m => m.text?.includes(text));

    if (targetMessage && targetMessage.ts) {

      const reactionResult = await web.reactions.get({
        channel: channel,
        timestamp: targetMessage.ts
      });

      let reactingUsers = [];

      if (reactionResult.ok && reactionResult.message && reactionResult.message.reactions) {
        const userSet = new Set();
        reactionResult.message.reactions.forEach(reaction => {
          if (reaction.users && Array.isArray(reaction.users)) {
            reaction.users.forEach(userId => userSet.add(userId));
          }
        });
        const allReactingUserIDs = Array.from(userSet);

        if (allReactingUserIDs.length > 0) {
          const userInfoPromises = allReactingUserIDs.map(userId =>
            web.users.info({ user: userId }).catch(err => {
              return null;
            })
          );
          const userInfoResults = await Promise.all(userInfoPromises);

          reactingUsers = userInfoResults
            .filter(result => result && result.ok && result.user)
            .map(result => ({
              id: result.user.id,
              name: result.user.real_name || result.user.name
            }));

        }
      } else {
      }
      res.status(200).json({ reactingUsers: reactingUsers });

    } else {
      res.status(404).send(`Text "${text}" not found in recent messages of channel ${channel}`);
    }
  } catch (error) {
    if (error.message.includes('Slack token not found') || error.message.includes('userID is required')) {
        return res.status(401).send(`Error: ${error.message}`);
    }
    res.status(500).send(`メッセージ履歴またはリアクションの取得中にエラーが発生しました: ${error.message}`);
  }
});

app.post('/slack/dm', async (req, res) => {
  const { userId, text, tokenUserID } = req.body;

  if (!userId || !text) {
    return res.status(400).send('userId (recipient) and text are required');
  }
  if (!tokenUserID) {
    return res.status(400).send('tokenUserID (sender for token) is required');
  }

  try {
    const web = await getSlackWebClient(tokenUserID);
    const result = await web.chat.postMessage({
      channel: userId,
      text: text,
    });

    res.status(200).send(`DMをユーザー ${userId} に送信しました。`);
  } catch (error) {
    if (error.message.includes('Slack token not found') || error.message.includes('userID is required')) {
        return res.status(401).send(`Error: ${error.message}`);
    }
    res.status(500).send(`DMの送信中にエラーが発生しました: ${error.message}`);
  }
});

app.post('/slack/bulk-dm', async (req, res) => {
  const { members, warikanResult, paymentUrl, tokenUserID } = req.body;

  if (!members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).send('members (array) is required');
  }
  if (!warikanResult || typeof warikanResult !== 'object') {
    return res.status(400).send('warikanResult (object) is required');
  }
  if (!paymentUrl || typeof paymentUrl !== 'string') {
    return res.status(400).send('paymentUrl (string) is required');
  }
  if (!tokenUserID) {
    return res.status(400).send('tokenUserID is required');
  }

  let web;
  try {
    web = await getSlackWebClient(tokenUserID);
  } catch (error) {
    return res.status(401).send(`Error initializing Slack client: ${error.message}`);
  }

  const dmPromises = members.map(async (member) => {
    const amount = warikanResult[member.grade];
    if (amount === undefined) {
      return { success: false, userId: member.id, error: `No amount for grade ${member.grade}` };
    }

    const text = `${member.name}さんの割り勘金額は ${amount}円です。
こちらのリンクからお支払いください: ${paymentUrl}`;

    try {
      const result = await web.chat.postMessage({
        channel: member.id,
        text: text,
      });
      return { success: true, userId: member.id, ts: result.ts };
    } catch (error) {
      return { success: false, userId: member.id, error: error.message };
    }
  });

  try {
    const results = await Promise.allSettled(dmPromises);
    const successfulDMs = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedDMs = results.length - successfulDMs;

    const report = results.map(r => {
      if (r.status === 'fulfilled') return r.value;
      return { success: false, error: r.reason?.message || 'Unknown error' };
    });

    if (failedDMs > 0) {
      return res.status(207).json({
        message: `一斉DM送信処理完了。成功: ${successfulDMs}件, 失敗: ${failedDMs}件。`,
        details: report
      });
    }

    res.status(200).json({
      message: `全 ${successfulDMs} 件のDM送信に成功しました。`,
      details: report
    });

  } catch (error) {
    res.status(500).send(`一斉DMの処理中に予期せぬエラーが発生しました: ${error.message}`);
  }
});

app.listen(port, () => {
});