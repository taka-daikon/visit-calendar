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
            <p className="helper-text">利用者CSVに準じた項目を直接編集できます。色は利用者BOXに反映されます。</p>
          </div>
          <button onClick={onClose}>閉じる</button>
        </div>

        <div className="field-grid form-grid-2col">
          <label>利用者名<input value={draft.利用者名} onChange={(e) => onChange({ ...draft, 利用者名: e.target.value })} /></label>
          <label>居住地<input value={draft.居住地} onChange={(e) => onChange({ ...draft, 居住地: e.target.value })} /></label>
          <label>保険区分
            <select value={draft.保険区分} onChange={(e) => onChange({ ...draft, 保険区分: e.target.value as UserRecord['保険区分'] })}>
              <option value="医療保険">医療保険</option>
              <option value="介護保険">介護保険</option>
            </select>
          </label>
          <label>更新サイクル<input value={draft.更新サイクル} onChange={(e) => onChange({ ...draft, 更新サイクル: e.target.value })} placeholder="1ヶ月 / 3ヶ月 / 6ヶ月" /></label>
          <label>希望曜日<input value={draft.希望曜日} onChange={(e) => onChange({ ...draft, 希望曜日: e.target.value })} placeholder="月曜|木曜" /></label>
          <label>希望性別
            <select value={draft.希望性別} onChange={(e) => onChange({ ...draft, 希望性別: e.target.value as UserRecord['希望性別'] })}>
              <option value="希望なし">希望なし</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
            </select>
          </label>
          <label className="form-span-2">希望処置内容<input value={draft.希望処置内容} onChange={(e) => onChange({ ...draft, 希望処置内容: e.target.value })} placeholder="褥瘡処置 / 清潔ケア / リハビリ" /></label>
          {timeKeys.map((key) => (
            <label key={String(key)}>{String(key)}<input value={String(draft[key] ?? '')} onChange={(e) => onChange({ ...draft, [key]: e.target.value } as UserRecord)} placeholder="09:00-10:00" /></label>
          ))}
          <label>前回更新日<input type="date" value={draft.前回更新日 || ''} onChange={(e) => onChange({ ...draft, 前回更新日: e.target.value })} /></label>
          <label>書類期限日<input type="date" value={draft.書類期限日 || ''} onChange={(e) => onChange({ ...draft, 書類期限日: e.target.value })} /></label>
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
        </div>

        <div className="toolbar-actions left modal-actions">
          <button className="primary" onClick={onSave}>保存</button>
          <button onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
