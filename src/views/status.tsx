import type { NightOnDisk, Status } from '../status.js';

// § 2c: the counts read "ok 10 · retry 4 · fail 1"; an unreadable night is — (styleguide):
// the row stays on the board, the missing counts are never dropped or blank.
function nightCounts(n: NightOnDisk): string {
  const c = n.counts;
  return c === null ? '—' : `ok ${c.ok} · retry ${c.retry} · fail ${c.fail}`;
}

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((n) => (
            <li>
              <a href={`/digest/${n.night}`}>{n.night}</a>
              <span class="mute"> · {nightCounts(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
