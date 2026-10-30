import type { NightDigest } from '../digest/types.js';

// plan § 2a: one table of the night, rows sorted by job (readNight guarantees), retries of
// 3 or more and any fail tagged in the status cell. Missing data renders as — (styleguide).
export function DigestPage({ night }: { night: NightDigest }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>status</th>
              <th>runs</th>
              <th>retries</th>
              <th>owner</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <tr key={row.job}>
                <td>{row.job}</td>
                <td>
                  <span class={row.lastStatus === 'fail' ? 'tag warn' : 'tag'}>{row.lastStatus}</span>
                  {row.retries >= 3 ? <span class="tag">3+ retries</span> : null}
                </td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.owner !== null ? row.owner : '—'}</td>
                <td>{row.lastError !== null ? row.lastError : '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="mute">
          {night.badLines} {night.badLines === 1 ? 'line' : 'lines'} skipped — didn't parse
        </p>
      ) : null}
    </>
  );
}
