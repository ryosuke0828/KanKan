const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

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
    } catch (err) {
        process.exit(1);
    }
}

connectDb();

async function handleLoginRequest(req, res, pool) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute(
      'SELECT userID, password, slackToken FROM sys_users WHERE userID = ?',
      [email]
    );

    if (rows.length > 0) {
      const user = rows[0];
      if (user.password === password) {
        const { password, ...userWithoutPassword } = user;
        res.status(200).json({ message: 'Login successful', user: userWithoutPassword, slackToken: user.slackID });
      } else {
        res.status(401).json({ error: 'Invalid email or password.' });
      }
    } else {
      res.status(401).json({ error: 'Invalid email or password.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Login failed due to a server error.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = { handleLoginRequest };