/** Placeholder shown while a list/metrics fetch is in flight — without this, `loading` was tracked
 * in state but never rendered, so a slow network made the page look empty rather than loading. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr key={index} className="skeleton-row">
          <td colSpan={99}><span className="skeleton-block" /></td>
        </tr>
      ))}
    </>
  )
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <article className="metric-card skeleton-card" key={index}>
          <span className="skeleton-block" style={{ width: 29, height: 29, borderRadius: 7 }} />
          <span className="skeleton-block" style={{ width: '60%', height: 11, marginTop: 15 }} />
          <span className="skeleton-block" style={{ width: '40%', height: 18, marginTop: 7 }} />
        </article>
      ))}
    </>
  )
}
