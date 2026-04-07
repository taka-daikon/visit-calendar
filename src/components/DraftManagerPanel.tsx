interface SavedDraftItem {
  id: string;
  name: string;
  businessName: string;
  savedAt: string;
}

interface Props {
  draftName: string;
  onChangeDraftName: (value: string) => void;
  onSaveDraft: () => void;
  drafts: SavedDraftItem[];
  onRestoreDraft: (draftId: string) => void;
  onDeleteDraft: (draftId: string) => void;
}

function formatSavedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function DraftManagerPanel({ draftName, onChangeDraftName, onSaveDraft, drafts, onRestoreDraft, onDeleteDraft }: Props) {
  return (
    <section className="card panel">
      <h2>スケジュール下書き保存</h2>
      <p className="helper-text">保存名を付けて下書き保存すると、ブラウザ自動保存に加えてJSONファイルも保存します。途中退出や電源断の後でも、一覧から復元できます。</p>
      <div className="draft-save-row">
        <input value={draftName} onChange={(e) => onChangeDraftName(e.target.value)} placeholder="例: 4月第1週・岡山北" />
        <button className="primary" onClick={onSaveDraft}>下書き保存</button>
      </div>
      <div className="compact-list">
        {drafts.length === 0 && <p className="empty">まだ下書きはありません。</p>}
        {drafts.map((draft) => (
          <article key={draft.id} className="mini-card draft-card">
            <div className="split-line">
              <div>
                <strong>{draft.name}</strong>
                <div className="card-subtext">{draft.businessName} / {formatSavedAt(draft.savedAt)}</div>
              </div>
              <div className="draft-actions">
                <button className="primary-soft" onClick={() => onRestoreDraft(draft.id)}>復元</button>
                <button onClick={() => onDeleteDraft(draft.id)}>削除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
