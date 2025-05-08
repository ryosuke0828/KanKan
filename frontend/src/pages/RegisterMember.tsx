import React, { useState, useEffect } from 'react';
import axios from 'axios';

const DB_API_BASE_URL = process.env.REACT_APP_API_BASE_URL_DB

const GRADE_OPTIONS = ['B3', 'B4', 'M1', 'M2', 'D', 'P'];

interface Member {
  id: number;
  slackID: string;
  name: string;
  grade: string;
}

interface RegisterMemberProps {
  userID: string | null;
}

const RegisterMember: React.FC<RegisterMemberProps> = ({ userID }) => {
  const [slackID, setslackID] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(GRADE_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [members, setMembers] = useState<Member[]>([]);

  const fetchMembers = async () => {
    if (!userID) {
      setMessage('ユーザーIDが取得できません。メンバーリストの取得に失敗しました。');
      return;
    }
    try {
      const response = await axios.get<Member[]>(`${DB_API_BASE_URL}/members`, { params: { userID: userID } });
      setMembers(response.data);
    } catch (error) {
      setMessage('メンバーリストの取得に失敗しました。');
    }
  };

  useEffect(() => {
    if (userID) {
      fetchMembers();
    }
  }, [userID]);

  const handleRegister = async () => {
    if (!userID) {
      setMessage('ユーザーIDが取得できません。登録処理を中止しました。');
      return;
    }
    if (!slackID || !name || !grade) {
      setMessage('Slack ID、名前、グレードを入力してください。');
      return;
    }
    if (!/^[UW][A-Z0-9]+$/.test(slackID)) {
      setMessage('Slack IDの形式が正しくありません (例: U123ABC456)。');
      return;
    }
    setMessage('登録中...');
    try {
      const response = await axios.post(`${DB_API_BASE_URL}/members`, { userID: userID, slackID, name, grade });
      setMessage(`メンバー「${response.data.name} (${response.data.grade}, ID: ${response.data.slackID})」を登録しました。`);
      setslackID('');
      setName('');
      setGrade(GRADE_OPTIONS[0]);
      fetchMembers();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setMessage(`登録エラー: Slack ID「${slackID}」は既に登録されています。`);
      } else {
        setMessage(`登録エラー: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const handleDelete = async (memberslackID: string, memberName: string) => {
    if (!userID) {
      setMessage('ユーザーIDが取得できません。削除処理を中止しました。');
      return;
    }
    if (window.confirm(`メンバー「${memberName}」を削除してもよろしいですか？`)) {
      setMessage('削除中...');
      try {
        await axios.delete(`${DB_API_BASE_URL}/members/${memberslackID}`, { data: { userID: userID } });
        setMessage(`メンバー「${memberName}」を削除しました。`);
        fetchMembers();
      } catch (error) {
        setMessage(`削除エラー: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const handleAdvanceGrade = async () => {

    if (!userID) {
      setMessage('ユーザーIDが取得できません。学年更新処理を中止しました。');
      return;
    }
    if (window.confirm('全メンバーの学年を進めますか？ (B3→B4, B4→M1, M1→M2, M2→D)')) {
      setMessage('学年更新中...');
      try {
        const response = await axios.put(`${DB_API_BASE_URL}/members/advance-grade`, { userID: userID });
        setMessage(`学年を更新しました。${response.data.message || ''}`);
        fetchMembers();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
          setMessage(`学年更新エラー: ${error.response.data.error}`);
        } else if (axios.isAxiosError(error)) {
          setMessage(`学年更新エラー: ${error.message}`);
        } else {
          setMessage(`学年更新エラー: 予期せぬエラーが発生しました。`);
        }
      }
    }
  };

  const groupedMembers = members.reduce((acc, member) => {
    if (!acc[member.grade]) {
      acc[member.grade] = [];
    }
    acc[member.grade].push(member);
    return acc;
  }, {} as Record<string, Member[]>);

  return (
    <div>
      <h2>メンバー登録</h2>
      <div>
        <input
          type="text"
          value={slackID}
          onChange={(e) => setslackID(e.target.value)}
          placeholder="Slack ID (例: U123ABC456)"
          style={{ marginRight: '10px' }}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前"
          style={{ marginRight: '10px' }}
        />
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          style={{ marginRight: '10px' }}
        >
          {GRADE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button onClick={handleRegister}>登録</button>
      </div>
      {message && <p>{message}</p>}

      <hr style={{ margin: '20px 0' }} />

      <div>
        <button onClick={handleAdvanceGrade} style={{ marginBottom: '20px' }}>
          学年を進める (B3→B4, B4→M1, M1→M2, M2→D)
        </button>
      </div>

      <h2>登録済みメンバー</h2>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap'}}>
        {GRADE_OPTIONS.map((gradeOption) => (
          <div key={gradeOption} style={{ minWidth: '150px' }}>
            <h3>{gradeOption}</h3>
            {groupedMembers[gradeOption] && groupedMembers[gradeOption].length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {groupedMembers[gradeOption].map((member) => (
                  <li key={member.slackID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span>{member.name}</span>
                    <button
                      onClick={() => handleDelete(member.slackID, member.name)}
                      style={{ marginLeft: '10px', padding: '2px 5px', fontSize: '0.8em' }}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'gray' }}>該当なし</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterMember;
