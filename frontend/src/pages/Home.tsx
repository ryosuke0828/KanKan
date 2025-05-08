import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Member {
  id: string;
  name: string;
  grade: string;
}

interface ReactingUser {
  id: string;
  name: string;
}

interface HomeProps {
  userId: string | null;
}

const db_url = process.env.REACT_APP_API_BASE_URL_DB;
const slack_url = process.env.REACT_APP_API_BASE_URL_SLACK;

const Home: React.FC<HomeProps> = ({ userId }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [warikanResult, setWarikanResult] = useState<Record<string, number> | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false);
  const [isLoadingWarikan, setIsLoadingWarikan] = useState<boolean>(false);
  const [isLoadingDM, setIsLoadingDM] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dmStatus, setDmStatus] = useState<string | null>(null);

  const [slackChannelId, setSlackChannelId] = useState<string>('');
  const [slackMessageText, setSlackMessageText] = useState<string>('');
  const [reactingUsers, setReactingUsers] = useState<ReactingUser[]>([]);
  const [isLoadingReactingUsers, setIsLoadingReactingUsers] = useState<boolean>(false);
  const [reactingUsersError, setReactingUsersError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchedMembers, setSearchedMembers] = useState<Member[]>([]);

  const fetchMembers = async () => {
    if (!userId) {
      setError('ユーザーIDが取得できません。');
      setIsLoadingMembers(false);
      return;
    }
    setIsLoadingMembers(true);
    setError(null);
    try {
      const response = await axios.get(`${db_url}/members`, { params: { userID: userId } });
      const fetchedMembers = response.data.map((member: any) => ({
        id: member.slackID,
        name: member.name,
        grade: member.grade,
      }));
      setMembers(fetchedMembers);
    } catch (err) {
      setError('メンバーリストの取得に失敗しました。');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchMembers();
    }
  }, [userId]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = members.filter(member =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setSearchedMembers(filtered);
    } else {
      setSearchedMembers([]);
    }
  }, [searchTerm, members]);

  const handleMemberSelect = (member: Member) => {
    setSelectedMembers(prev =>
      prev.some(m => m.id === member.id)
        ? prev.filter(m => m.id !== member.id)
        : [...prev, member]
    );
  };

  const handleRemoveMember = (memberId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleCalculateWarikan = async () => {
    if (selectedMembers.length === 0 || totalAmount <= 0) {
      setError('参加者を選択し、合計金額を正しく入力してください。');
      return;
    }
    setIsLoadingWarikan(true);
    setError(null);
    setWarikanResult(null);

    try {
      const participants = selectedMembers.map(m => ({ name: m.name, grade: m.grade }));
      const weights: Record<string, number> = { 'B3': 1, 'B4': 1, 'M1': 1.2, 'M2': 1.2, 'D': 1.5, 'P': 2 };

      const response = await axios.post(`${db_url}/warikan`, {
        participants,
        weights,
        totalAmount,
      });
      setWarikanResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '割り勘計算に失敗しました。');
    } finally {
      setIsLoadingWarikan(false);
    }
  };

  const handleSendBulkDM = async () => {
    if (!warikanResult || selectedMembers.length === 0 || !paymentUrl) {
      setError('割り勘計算を実行し、PayPayリンクを入力してください。');
      return;
    }
    if (!userId) {
      setError('ユーザーIDが取得できません。DM送信にはログインが必要です。');
      return;
    }
    setIsLoadingDM(true);
    setError(null);
    setDmStatus(null);

    try {
      const response = await axios.post(`${slack_url}/bulk-dm`, {
        members: selectedMembers,
        warikanResult,
        paymentUrl,
        tokenUserID: userId,
      });
      setDmStatus(response.data.message || 'DM送信処理が完了しました。');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || '一斉DMの送信に失敗しました。');
      setDmStatus(null);
    } finally {
      setIsLoadingDM(false);
    }
  };

  const handleFetchReactingUsers = async () => {
    if (!slackChannelId || !slackMessageText) {
      setReactingUsersError('SlackチャンネルIDとメッセージテキストを入力してください。');
      return;
    }
    if (!userId) {
      setReactingUsersError('ユーザーIDが取得できません。リアクション取得にはログインが必要です。');
      return;
    }
    setIsLoadingReactingUsers(true);
    setReactingUsersError(null);
    setReactingUsers([]);

    try {
      await fetchMembers();

      const response = await axios.get(`${slack_url}`, {
        params: {
          channel: slackChannelId,
          text: slackMessageText,
          userID: userId,
        },
      });
      if (response.data && Array.isArray(response.data.reactingUsers)) {
        setReactingUsers(response.data.reactingUsers);
        const newSelectedMembers = response.data.reactingUsers.map((reactingUser: ReactingUser) => {
          const existingMember = members.find(m => m.id === reactingUser.id);
          if (existingMember) {
            return existingMember;
          }
          return { ...reactingUser, grade: 'N/A' };
        });
        setSelectedMembers(prevSelected => {
          const updatedSelection = [...prevSelected];
          newSelectedMembers.forEach(newMember => {
            if (!prevSelected.some(selected => selected.id === newMember.id)) {
              updatedSelection.push(newMember);
            }
          });
          return updatedSelection;
        });

      } else {
        setReactingUsers([]);
        setReactingUsersError('リアクションユーザーの取得結果が不正です。');
      }
    } catch (err: any) {
      setReactingUsersError(err.response?.data?.message || err.response?.data || 'リアクションユーザーの取得に失敗しました。');
    } finally {
      setIsLoadingReactingUsers(false);
    }
  };

  return (
    <div>
      {error && <p style={{ color: 'red' }}>エラー: {error}</p>}

      <div style={{ marginTop: '30px', marginBottom: '30px', padding: '15px', border: '1px solid #ddd' }}>
        <h2>Slackリアクションユーザー取得</h2>
        {reactingUsersError && <p style={{ color: 'red' }}>エラー: {reactingUsersError}</p>}
        <div>
          <label htmlFor="slackChannelId">SlackチャンネルID: </label>
          <input
            type="text"
            id="slackChannelId"
            value={slackChannelId}
            onChange={(e) => setSlackChannelId(e.target.value)}
            placeholder="C0XXXXXXXXX"
            style={{ marginRight: '10px', marginBottom: '10px' }}
          />
        </div>
        <div>
          <label htmlFor="slackMessageText">メッセージ内テキスト: </label>
          <input
            type="text"
            id="slackMessageText"
            value={slackMessageText}
            onChange={(e) => setSlackMessageText(e.target.value)}
            placeholder="メッセージに含まれる一意なテキスト"
            style={{ marginRight: '10px', width: '300px', marginBottom: '10px' }}
          />
        </div>
        <button onClick={handleFetchReactingUsers} disabled={isLoadingReactingUsers}>
          {isLoadingReactingUsers ? '取得中...' : 'リアクションしたユーザーを取得'}
        </button>
        {isLoadingReactingUsers && <p>リアクションユーザーを読み込み中...</p>}
        {reactingUsers.length > 0 && (
          <div style={{ marginTop: '15px' }}>
            <h3>リアクションしたユーザー ({reactingUsers.length}名):</h3>
            <ul>
              {reactingUsers.map(user => (
                <li key={user.id}>{user.name} (ID: {user.id})</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2>参加メンバー選択</h2>
      {isLoadingMembers ? (
        <p>メンバーリストを読み込み中...</p>
      ) : (
        <>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="memberSearch">メンバー検索: </label>
            <input
              type="text"
              id="memberSearch"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="名前で検索"
              style={{ marginRight: '10px' }}
            />
            {searchedMembers.length > 0 && (
              <ul style={{ listStyleType: 'none', paddingLeft: 0, border: '1px solid #eee', maxHeight: '150px', overflowY: 'auto' }}>
                {searchedMembers.map(member => (
                  <li
                    key={member.id}
                    onClick={() => {
                      handleMemberSelect(member);
                      setSearchTerm('');
                    }}
                    style={{ padding: '5px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                    className={selectedMembers.some(m => m.id === member.id) ? 'selected-member-suggestion' : ''}
                  >
                    {member.name} ({member.grade}) {selectedMembers.some(m => m.id === member.id) && ' (選択済み)'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
            {members.map(member => (
              <button
                key={member.id}
                onClick={() => handleMemberSelect(member)}
                style={{
                  padding: '8px 12px',
                  border: selectedMembers.some(m => m.id === member.id) ? '2px solid blue' : '1px solid grey',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: selectedMembers.some(m => m.id === member.id) ? '#e0e0ff' : 'white'
                }}
              >
                {member.name} ({member.grade})
              </button>
            ))}
          </div>
        </>
      )}
      <p>選択中のメンバー:</p>
      {selectedMembers.length > 0 ? (
        <ul>
          {selectedMembers.map(member => (
            <li key={member.id}>
              {member.name} ({member.grade})
              <button onClick={() => handleRemoveMember(member.id)} style={{ marginLeft: '10px', padding: '2px 5px' }}>
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>なし</p>
      )}

      <h2>割り勘計算</h2>
      <div>
        <label htmlFor="totalAmount">合計金額: </label>
        <input
          type="number"
          id="totalAmount"
          value={totalAmount}
          onChange={(e) => setTotalAmount(Number(e.target.value))}
          min="0"
          style={{ marginRight: '10px' }}
        />
        <button onClick={handleCalculateWarikan} disabled={isLoadingWarikan || selectedMembers.length === 0}>
          {isLoadingWarikan ? '計算中...' : '割り勘計算実行'}
        </button>
      </div>

      {warikanResult && (
        <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px' }}>
          <h3>計算結果</h3>
          <ul>
            {Object.entries(warikanResult).map(([grade, amount]) => (
              <li key={grade}>学年 {grade}: {amount.toLocaleString()} 円</li>
            ))}
          </ul>

          <h4>一斉DM送信</h4>
          <div>
            <label htmlFor="paymentUrl">PayPayリンク: </label>
            <input
              type="url"
              id="paymentUrl"
              value={paymentUrl}
              onChange={(e) => setPaymentUrl(e.target.value)}
              placeholder="https://paypay.me/your_id"
              required
              style={{ width: '300px', marginRight: '10px' }}
            />
            <button onClick={handleSendBulkDM} disabled={isLoadingDM || !paymentUrl}>
              {isLoadingDM ? '送信中...' : '選択したメンバーにDM送信'}
            </button>
          </div>
          {dmStatus && <p style={{ color: 'green', marginTop: '10px' }}>{dmStatus}</p>}
        </div>
      )}
    </div>
  );
};

export default Home;