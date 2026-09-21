import { Icon, type IconName } from './Icon';

interface StatTileProps {
  icon?: IconName;
  value: string | number;
  unit?: string;
  label: string;
  /** Optional trend line under the label (e.g. "1.2kg this month"). */
  delta?: { value: string; dir: 'up' | 'down' | 'flat' };
  onClick?: () => void;
}

/** 2×2-grid stat card: copper icon, big DM Mono number, uppercase label. */
export function StatTile({ icon, value, unit, label, delta, onClick }: StatTileProps) {
  const Tag = onClick ? 'button' : 'div';
  const deltaColor = delta?.dir === 'up' ? 'text-success' : delta?.dir === 'down' ? 'text-danger' : 'text-earth-muted';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`stat-tile text-start ${onClick ? 'transition-transform active:scale-[0.98]' : ''}`}
    >
      {icon && (
        <span className="text-brand">
          <Icon name={icon} size={20} />
        </span>
      )}
      <div className="stat-num">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
      {delta && (
        <div className={`mt-0.5 flex items-center gap-1 font-mono text-[10.5px] ${deltaColor}`}>
          {delta.dir !== 'flat' && <Icon name="arrowUp" size={10} className={delta.dir === 'down' ? 'rotate-180' : ''} />}
          {delta.value}
        </div>
      )}
    </Tag>
  );
}
