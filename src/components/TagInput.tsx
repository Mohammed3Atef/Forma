import { useState } from 'react';
import { Icon } from './Icon';

/**
 * Tag/chip input: type a value and press Enter (or comma) to add it; tap a chip
 * to remove. Used for free-form lists like food likes/dislikes/allergies.
 */
export function TagInput({
  values,
  onChange,
  placeholder,
  testId,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          data-testid={testId}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-ghost px-4" onClick={add} aria-label="add" disabled={!draft.trim()}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <button key={v} type="button" className="chip chip-on flex items-center gap-1.5" onClick={() => onChange(values.filter((x) => x !== v))}>
              {v}
              <Icon name="close" size={13} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
