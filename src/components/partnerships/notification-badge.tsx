// Absolute-positioned circular badge for unread/pending counts.
// Parent must establish a positioning context (position: relative | inline-flex).
export function NotificationBadge({
  count,
  color = "#E24B4A",
}: {
  count: number | null | undefined;
  color?: string;
}) {
  if (!count || count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} pending`}
      className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full text-white text-[10px] font-medium leading-none"
      style={{
        backgroundColor: color,
        width: 16,
        height: 16,
        minWidth: 16,
        paddingLeft: count > 9 ? 3 : 0,
        paddingRight: count > 9 ? 3 : 0,
      }}
    >
      {display}
    </span>
  );
}
