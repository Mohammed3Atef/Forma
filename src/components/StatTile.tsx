import { Icon, type IconName } from './Icon';

interface StatTileProps {
  icon?: IconName;
  value: string | number;
  unit?: string;
  label: string;
  onClick?: () => void;
}

/** 2×2-grid stat card: copper icon, big DM Mono number, uppercase label. */
export function StatTile({ icon, value, unit, label, onClick }: StatTileProps) {
  const Tag = onClick ? 'button' : 'div';
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
    </Tag>
  );
}
