import { Nurse, UserRecord } from '../types';

interface Props {
  title: string;
  draft: UserRecord;
  nurses: Nurse[];
  colorOptions: string[];
  onChange: (draft: UserRecord) => void;
  onClose: () => void;
  onSave: () => void;
}

const timeKeys: Array<keyof UserRecord> = ['月曜希望時間', '火曜希望時間', '水曜希望時間', '木曜希望時間', '金曜希望時間', '土曜希望時間', '日曜希望時間'];

export function UserFormModal({ title, draft, nurses, colorOptions, onChange, onClose, onSave }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card form-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header split-line">
          <div>
            <h2>{title}</h2>
            <p className="helper-text">今後のExcelヘッダー運用を前提に、住所・訪問希望・NG日・要望まで直接編集できます。</p>
          </div>
          <button onClick={onClose}>閉じる</button>
        </div>

        <div className="field-grid form-grid-2col">
          <label>利用者名<input value={draft.利用者名} onChange={(e) => onChange({ ...draft, 利用者名: e.target.value })} /></label>
          <label>かな<input value={draft.かな || ''} onChange={(e) => onChange({ ...draft, かな: e.target.value })} /></label>
          <label>利用者ID<input value={draft.利用者ID || ''} onChange={(e) => onChange({ ...draft, 利用者ID: e.target.value })} /></label>
          <label>入力者<input value={draft.入力者 || ''} onChange={(e) => onChange({ ...draft, 入力者: e.target.value })} /></label>
          <label>施設名<input value={draft.施設名 || ''} onChange={(e) => onChange({ ...draft, 施設名: e.target.value })} /></label>
          <label>住所<input value={draft.住所 || draft.居住地} onChange={(e) => onChange({ ...draft, 住所: e.target.value, 居住地: e.target.value })} /></label>
          <label>保険対象
            <select
              value={draft.保険区分}
              onChange={(e) => onChange({
                ...draft,
                保険区分: e.target.value as UserRecord['保険区分'],
                保険対象: e.target.value
              })}
            >
              <option value="医療保険">医療保険</option>
              <option value="介護保険">介護保険</option>
            </select>
          </label>
          <label>更新サイクル<input value={draft.更新サイクル} onChange={(e) => onChange({ ...draft, 更新サイクル: e.target.value })} placeholder="1ヶ月 / 3ヶ月 / 6ヶ月" /></label>
          <label>訪問希望曜日<input value={draft.訪問希望曜日 || draft.希望曜日} onChange={(e) => onChange({ ...draft, 訪問希望曜日: e.target.value, 希望曜日: e.target.value })} placeholder="火曜|木曜" /></label>
          <label>訪問希望時間帯<input value={draft.訪問希望時間帯 || ''} onChange={(e) => onChange({ ...draft, 訪問希望時間帯: e.target.value })} placeholder="10:00-14:00" /></label>
          <label>訪問NG日付<input value={draft.訪問NG日付 || ''} onChange={(e) => onChange({ ...draft, 訪問NG日付: e.target.value })} placeholder="2026/04/28|2026/05/02" /></label>
          <label>訪問NG開始時間<input value={draft.訪問NG開始時間 || ''} onChange={(e) => onChange({ ...draft, 訪問NG開始時間: e.target.value })} placeholder="13:00" /></label>
          <label>訪問NG終了時間<input value={draft.訪問NG終了時間 || ''} onChange={(e) => onChange({ ...draft, 訪問NG終了時間: e.target.value })} placeholder="15:00" /></label>
          <label>女性希望
            <select
              value={draft.希望性別}
              onChange={(e) => onChange({
                ...draft,
                希望性別: e.target.value as UserRecord['希望性別'],
                女性希望: e.target.value === '女性' ? '希望' : ''
              })}
            >
              <option value="希望なし">希望なし</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
            </select>
          </label>
          <label className="form-span-2">希望ケア<input value={draft.希望ケア || draft.希望処置内容} onChange={(e) => onChange({ ...draft, 希望ケア: e.target.value, 希望処置内容: e.target.value })} placeholder="褥瘡処置 / 清潔ケア / リハビリ" /></label>
          <label className="form-span-2">その他要望<textarea rows={3} value={draft.その他要望 || ''} onChange={(e) => onChange({ ...draft, その他要望: e.target.value })} placeholder="注意事項や連絡事項" /></label>
          <label>入力日<input type="date" value={draft.入力日 || ''} onChange={(e) => onChange({ ...draft, 入力日: e.target.value })} /></label>
          <label>更新日<input type="date" value={draft.更新日 || ''} onChange={(e) => onChange({ ...draft, 更新日: e.target.value })} /></label>
          <label>利用者確認日<input type="date" value={draft.利用者確認日 || draft.前回更新日 || ''} onChange={(e) => onChange({ ...draft, 利用者確認日: e.target.value, 前回更新日: e.target.value })} /></label>
          <label>確定の有無<input value={draft.確定の有無 || ''} onChange={(e) => onChange({ ...draft, 確定の有無: e.target.value })} placeholder="TRUE / FALSE" /></label>
          <label>担当看護師
            <select
              value={draft.preferredNurseId || ''}
              onChange={(e) => {
                const nurse = nurses.find((item) => item.id === e.target.value);
                onChange({
                  ...draft,
                  preferredNurseId: nurse?.id || '',
                  preferredNurseName: nurse?.name || '',
                  担当看護師名: nurse?.name || ''
                });
              }}
            >
              <option value="">未割当</option>
              {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.name}</option>)}
            </select>
          </label>
          <div className="form-span-2">
            <span className="form-label">BOXカラー</span>
            <div className="color-picker-grid">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-swatch ${draft.boxColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => onChange({ ...draft, boxColor: color, カラー: color })}
                  aria-label={`色 ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="form-span-2 advanced-user-fields">
            <details>
              <summary>曜日ごとの細かい時間設定</summary>
              <div className="field-grid form-grid-2col advanced-user-fields-grid">
                {timeKeys.map((key) => (
                  <label key={String(key)}>{String(key)}<input value={String(draft[key] ?? '')} onChange={(e) => onChange({ ...draft, [key]: e.target.value } as UserRecord)} placeholder="09:00-10:00" /></label>
                ))}
              </div>
            </details>
          </div>
        </div>

        <div className="toolbar-actions left modal-actions">
          <button className="primary" onClick={onSave}>保存</button>
          <button onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
