const express = require('express');
const mysql = require('mysql2/promise');
const warikan = require('./warikan');
const { handleLoginRequest } = require('./login');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(express.json());

app.use(cors());

app.post('/api/login', (req, res) => {
    handleLoginRequest(req, res, pool);
});

const dbConfig = {
    host: 'localhost',
    user: 'root_user_yade',
    password: 'tanakalab_kankan',
    database: 'kankan_member',
    connectionLimit: 10
};

let pool;
let isLocked = false;

async function connectDb() {
    try {
        pool = mysql.createPool(dbConfig);
    } catch (err) {
        process.exit(1);
    }
}

app.post('/api/members', async (req, res) => {
    const { userID, slackID, name, grade } = req.body;

    if (typeof userID !== 'string' || userID.trim() === '' ||
        typeof slackID !== 'string' || slackID.trim() === '' ||
        typeof name !== 'string' || name.trim() === '' ||
        typeof grade !== 'string' || grade.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID, slackID, name, and grade must be non-empty strings.' });
    }

    if (isLocked) {
        return res.status(503).json({ error: 'Service busy, please try again later.' });
    }

    let connection;
    try {
        isLocked = true;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            'INSERT INTO members (email, slackID, name, grade) VALUES (?, ?, ?, ?)',
            [userID, slackID, name, grade]
        );

        await connection.commit();

        const [newMember] = await connection.execute('SELECT * FROM members WHERE slackID = ? AND email = ?', [slackID, userID]);
        res.status(201).json(newMember[0]);

    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'Failed to create member. Slack ID already exists.' });
        } else {
            res.status(500).json({ error: 'Failed to create member.' });
        }
    } finally {
        if (connection) {
            connection.release();
        }
        isLocked = false;
    }
});

app.get('/api/members', async (req, res) => {
    const { userID } = req.query;

    if (typeof userID !== 'string' || userID.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID must be a non-empty string.' });
    }

    try {
        const [rows] = await pool.execute('SELECT * FROM members WHERE email = ?', [userID]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch members.' });
    }
});

app.put('/api/members/advance-grade', async (req, res) => {
    const { userID } = req.body;

    if (typeof userID !== 'string' || userID.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID must be a non-empty string.' });
    }

    if (isLocked) {
        return res.status(503).json({ error: 'Service busy, please try again later.' });
    }

    let connection;
    try {
        isLocked = true;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const gradeTransitions = {
            'B3': 'B4',
            'B4': 'M1',
            'M1': 'M2',
            'M2': 'D'
        };

        let updatedCount = 0;

        const processingOrder = ['M2', 'M1', 'B4', 'B3'];

        for (const oldGrade of processingOrder) {
            if (gradeTransitions[oldGrade]) {
                const newGrade = gradeTransitions[oldGrade];
                const [result] = await connection.execute(
                    'UPDATE members SET grade = ? WHERE email = ? AND grade = ?',
                    [newGrade, userID, oldGrade]
                );
                updatedCount += result.affectedRows;
            }
        }

        await connection.commit();

        if (updatedCount > 0) {
            res.json({ message: `${updatedCount}人のメンバーの学年を更新しました。` });
        } else {
            res.json({ message: '学年更新対象のメンバーがいませんでした。' });
        }

    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ error: 'Failed to advance grades.' });
    } finally {
        if (connection) {
            connection.release();
        }
        isLocked = false;
    }
});

app.get('/api/members/:slackID', async (req, res) => {
    const slackID = req.params.slackID;
    const { userID } = req.query;

    if (!slackID || typeof slackID !== 'string' || !/^[UW][A-Z0-9]+$/.test(slackID)) {
        return res.status(400).json({ error: 'Member Slack ID is invalid' });
    }
    if (typeof userID !== 'string' || userID.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID must be a non-empty string.' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM members WHERE slackID = ? AND email = ?',
            [slackID, userID]
        );

        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Member not found.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch member.' });
    }
});

app.put('/api/members/:slackID', async (req, res) => {
    const targetslackID = req.params.slackID;
    const { userID, name, grade } = req.body;

    if (!targetslackID || typeof targetslackID !== 'string' || !/^[UW][A-Z0-9]+$/.test(targetslackID)) {
        return res.status(400).json({ error: 'Target member Slack ID is invalid.' });
    }
    if (typeof userID !== 'string' || userID.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID must be a non-empty string.' });
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
        return res.status(400).json({ error: 'Invalid input: name must be a non-empty string if provided.' });
    }
    if (grade !== undefined && (typeof grade !== 'string' || grade.trim() === '')) {
        return res.status(400).json({ error: 'Invalid input: grade must be a non-empty string if provided.' });
    }
    if (name === undefined && grade === undefined) {
        return res.status(400).json({ error: 'No update fields provided (name or grade).' });
    }

    if (isLocked) {
        return res.status(503).json({ error: 'Service busy, please try again later.' });
    }

    let connection;
    try {
        isLocked = true;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const updates = [];
        const values = [];
        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (grade !== undefined) {
            updates.push('grade = ?');
            values.push(grade);
        }
        values.push(targetslackID);
        values.push(userID);

        const [result] = await connection.execute(
            `UPDATE members SET ${updates.join(', ')} WHERE slackID = ? AND email = ?`,
            values
        );

        if (result.affectedRows > 0) {
            const [updatedRows] = await connection.execute(
                'SELECT * FROM members WHERE slackID = ? AND email = ?',
                [targetslackID, userID]
            );
            await connection.commit();
            res.json(updatedRows[0]);
        } else {
            await connection.rollback();
            res.status(404).json({ error: 'Member not found or no changes made.' });
        }
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ error: 'Failed to update member.' });
    } finally {
        if (connection) {
            connection.release();
        }
        isLocked = false;
    }
});

app.delete('/api/members/:slackID', async (req, res) => {
    const slackID = req.params.slackID;
    const { userID } = req.body;

    if (!slackID || typeof slackID !== 'string' || !/^[UW][A-Z0-9]+$/.test(slackID)) {
        return res.status(400).json({ error: 'Member Slack ID is invalid.' });
    }
    if (typeof userID !== 'string' || userID.trim() === '') {
        return res.status(400).json({ error: 'Invalid input: userID must be a non-empty string.' });
    }

    if (isLocked) {
        return res.status(503).json({ error: 'Service busy, please try again later.' });
    }

    let connection;
    try {
        isLocked = true;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.execute(
            'DELETE FROM members WHERE slackID = ? AND email = ?',
            [slackID, userID]
        );

        if (result.affectedRows > 0) {
            await connection.commit();
            res.status(200).json({ message: 'Member deleted successfully.' });
        } else {
            await connection.rollback();
            res.status(404).json({ error: 'Member not found.' });
        }
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ error: 'Failed to delete member.' });
    } finally {
        if (connection) {
            connection.release();
        }
        isLocked = false;
    }
});

app.post('/api/warikan', (req, res) => {
    const { participants, weights, totalAmount } = req.body;

    try {
        const result = warikan.calculateWarikan(participants, weights, totalAmount);
        res.json(result);
    } catch (error) {
        if (error.message.startsWith('Invalid input')) {
            res.status(400).json({ error: error.message });
        } else if (error.message.startsWith('Calculation error')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to calculate warikan.' });
        }
    }
});

async function startServer() {
    await connectDb();
    app.listen(port, () => {
    });
}

startServer();