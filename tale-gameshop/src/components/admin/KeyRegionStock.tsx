import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { getKeyRegionOverview, type KeyRegionRow, type KeyGameSeries, type KeyOutOfStockRow } from '../../api/adminKeysApi';

/**
 * Склад ключей: что кончается и что пополнять.
 *
 * Графики строятся по ИГРАМ, а не по областям активации: закупают ключи для игры, и «Global»
 * на сорок шесть игр одной полосой не говорит ничего. Область при этом никуда не девается —
 * она стоит в подписи игры и в таблице ниже, потому что партия «EU» может кончиться, пока
 * «Global» той же игры ещё лежит.
 *
 * Срок «на сколько хватит» считается от скорости продаж, а не от остатка: десять ключей при трёх
 * продажах в день — это три дня, а не «в порядке». Сама скорость берётся с первой продажи в окне,
 * а не по всему окну: игра, поступившая в продажу неделю назад, не должна выглядеть медленной
 * из-за трёх пустых недель до неё. Игра без продаж прогноза не получает: прочерк честнее
 * выдуманного числа.
 */
const cellStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'left', verticalAlign: 'top' };
const headStyle: React.CSSProperties = { ...cellStyle, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' };

const OUT = '#dc2626';
const LOW = '#f59e0b';
const OK = '#7c3aed';

/** Цвет области: пусто — красный, мало — жёлтый, иначе обычный. Три состояния, без оттенков «почти». */
const stateOf = (available: number, lowThreshold: number) =>
  available === 0 ? { color: OUT, label: 'Out of keys' }
  : available <= lowThreshold ? { color: LOW, label: 'Running low' }
  : { color: OK, label: 'In stock' };

/** Подпись игры: область добавляется только когда она что-то уточняет. */
const labelOf = (row: { title: string; regionTitle: string }) =>
  row.regionTitle && row.regionTitle !== 'Global' ? `${row.title} · ${row.regionTitle}` : row.title;

const KeyRegionStock: React.FC<{ onSelectGame?: (gameId: string, title: string) => void }> = ({ onSelectGame }) => {
  const [rows, setRows] = useState<KeyRegionRow[] | null>(null);
  const [games, setGames] = useState<KeyGameSeries[]>([]);
  const [outOfKeys, setOutOfKeys] = useState<KeyOutOfStockRow[]>([]);
  const [outOfKeysTotal, setOutOfKeysTotal] = useState(0);
  const [totalDaily, setTotalDaily] = useState<number[]>([]);
  const [lowThreshold, setLowThreshold] = useState(5);
  /** Сколько дней запаса считать «скоро кончится». Число приходит с сервера — там же, где считается. */
  const [soonDays, setSoonDays] = useState(7);
  const [days, setDays] = useState<string[]>([]);
  const [windowDays, setWindowDays] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async (span: number) => {
    try {
      const data = await getKeyRegionOverview(span);
      setRows(data.regions);
      setGames(data.games ?? []);
      setOutOfKeys(data.outOfKeys ?? []);
      setOutOfKeysTotal(data.outOfKeysTotal ?? 0);
      setTotalDaily(data.totalDaily ?? []);
      setLowThreshold(data.lowThreshold ?? 5);
      setSoonDays(data.soonDays ?? 7);
      setDays(data.days ?? []);
      setWindowDays(data.windowDays ?? span);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(windowDays); }, [load, windowDays]);

  // Что кончится раньше всех. Ось — дни запаса, а не остаток: это и есть вопрос закупки.
  const runningOutOptions = useMemo<Highcharts.Options>(() => {
    const data = games
      .filter((game) => game.daysLeft !== null)
      .slice(0, 12)
      .map((game) => ({
        name: labelOf(game),
        y: game.daysLeft as number,
        color: (game.daysLeft as number) <= soonDays ? OUT : (game.daysLeft as number) <= soonDays * 3 ? LOW : OK,
        available: game.available,
        perDay: game.perDay,
        activeDays: game.activeDays,
      }));

    return {
      chart: { type: 'bar', height: Math.max(180, 34 * data.length + 60) },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: { categories: data.map((point) => point.name), lineWidth: 0, tickWidth: 0 },
      yAxis: {
        title: { text: 'Days of stock left' },
        allowDecimals: false,
        gridLineColor: '#eef0f4',
        plotLines: [{
          value: soonDays,
          color: OUT,
          dashStyle: 'ShortDash',
          width: 1,
          label: { text: `restock: ${soonDays}d`, style: { color: '#991b1b', fontSize: '11px' } },
        }],
      },
      tooltip: {
        pointFormatter(this: Highcharts.Point) {
          const point = this as unknown as { y: number; available: number; perDay: number | null; activeDays: number };
          return `<b>${point.y}</b> day(s) left<br/>${point.available} in stock · ${point.perDay}/day over ${point.activeDays}d`;
        },
      },
      plotOptions: { bar: { borderRadius: 4, dataLabels: { enabled: true } } },
      series: [{ type: 'bar', name: 'Days left', data }],
    };
  }, [games, soonDays]);

  // Расход по дням: серия на игру, а не на область. Остальные игры — одной полосой, чтобы
  // верхушка не выглядела всем расходом магазина.
  const usageOptions = useMemo<Highcharts.Options>(() => {
    const shown = games.filter((game) => game.soldInWindow > 0).slice(0, 6);
    const others = days.map((_, index) =>
      Math.max(0, (totalDaily[index] ?? 0) - shown.reduce((sum, game) => sum + (game.daily[index] ?? 0), 0)),
    );

    const series: Highcharts.SeriesColumnOptions[] = shown.map((game) => ({
      type: 'column',
      name: labelOf(game),
      data: game.daily,
    }));

    if (others.some((value) => value > 0)) {
      series.push({ type: 'column', name: 'Other games', data: others, color: '#cbd5e1' });
    }

    return {
      chart: { type: 'column', height: 260 },
      title: { text: undefined },
      credits: { enabled: false },
      xAxis: { categories: days, tickInterval: Math.max(1, Math.floor(days.length / 8)), lineColor: '#eef0f4' },
      yAxis: { title: { text: 'Keys delivered' }, allowDecimals: false, gridLineColor: '#eef0f4' },
      tooltip: { shared: true },
      plotOptions: { column: { stacking: 'normal', borderWidth: 0, groupPadding: 0.05 } },
      series,
    };
  }, [games, days, totalDaily]);

  if (error || rows === null) {
    return null;
  }

  // Ни региональных партий, ни расхода — показывать нечего, и пустой блок только занимает место.
  if (rows.length <= 1 && rows.every((row) => row.needRestock.length === 0) && games.every((game) => game.soldInWindow === 0)) {
    return null;
  }

  const runningOut = games.filter((game) => game.daysLeft !== null && game.daysLeft <= soonDays);
  const hasUsage = games.some((game) => game.soldInWindow > 0);

  // Предупреждения по областям: пусто, мало или есть игры, которые кончатся на неделе.
  const warnings = rows
    .filter((row) => row.available === 0 || row.available <= lowThreshold || row.needRestock.length > 0 || row.gamesRunningOutSoon > 0)
    .map((row) => ({ row, state: stateOf(row.available, lowThreshold) }))
    .sort((a, b) => a.row.available - b.row.available);

  return (
    <div className="admin-card">
      <h2>Key stock: what runs out next</h2>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Days of stock left per game at the current sales rate, and which activation region the keys belong to.
        Games with no keys left are listed separately — a zero has no “days left” to plot.
      </p>

      {outOfKeys.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 10,
            border: '1px solid #fecaca',
            borderLeft: `4px solid ${OUT}`,
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <strong>Out of keys right now: {outOfKeysTotal} game(s)</strong> — nothing to sell until refilled.
            {outOfKeysTotal > outOfKeys.length && <> Showing {outOfKeys.length}.</>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {outOfKeys.map((game) => (
              <button
                key={`${game.offerKey}-${game.gameId}`}
                type="button"
                onClick={() => onSelectGame?.(game.gameId, game.title)}
                title={
                  game.delivered > 0
                    ? `Sold ${game.delivered} before running out`
                    : game.priced
                      ? 'Priced for this region, no keys ever added'
                      : 'No keys in this region'
                }
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid #fecaca',
                  background: '#fff',
                  color: '#b91c1c',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: onSelectGame ? 'pointer' : 'default',
                }}
              >
                {labelOf(game)}
                {/* Продавалась — значит спрос доказан, и пополнять её нужнее прочих. */}
                {game.delivered > 0 && <span style={{ color: '#9ca3af' }}> · sold {game.delivered}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {runningOut.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            marginBottom: 16,
            borderRadius: 10,
            border: '1px solid #fecaca',
            borderLeft: `4px solid ${OUT}`,
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          <strong>{runningOut.length} game(s) run out within {soonDays} days:</strong>{' '}
          {runningOut.slice(0, 6).map((game) => `${labelOf(game)} (~${game.daysLeft}d)`).join(', ')}
          {runningOut.length > 6 && ` and ${runningOut.length - 6} more`}
        </div>
      )}

      {games.some((game) => game.daysLeft !== null) ? (
        <HighchartsReact highcharts={Highcharts} options={runningOutOptions} />
      ) : (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Nothing was sold in the last {windowDays} days, so there is no run-out forecast yet.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>Keys delivered per day</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((span) => (
            <button
              key={span}
              type="button"
              onClick={() => setWindowDays(span)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid ' + (span === windowDays ? '#7c3aed' : '#e5e7eb'),
                background: span === windowDays ? '#f5f3ff' : '#fff',
                color: span === windowDays ? '#5b21b6' : '#6b7280',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {span} days
            </button>
          ))}
        </div>
      </div>

      {hasUsage ? (
        <HighchartsReact highcharts={Highcharts} options={usageOptions} />
      ) : (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          No keys were delivered in the last {windowDays} days — nothing to plot yet.
        </p>
      )}

      <h3 style={{ marginTop: 24 }}>By activation region</h3>
      {warnings.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {warnings.map(({ row, state }) => (
            <div
              key={row.offerKey}
              role={row.available === 0 ? 'alert' : undefined}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${row.available === 0 ? '#fecaca' : '#fde68a'}`,
                borderLeft: `4px solid ${state.color}`,
                background: row.available === 0 ? '#fef2f2' : '#fffbeb',
                color: row.available === 0 ? '#991b1b' : '#92400e',
                fontSize: 13,
              }}
            >
              <strong>{row.title}</strong>
              <span>
                {state.label}: <strong>{row.available}</strong> key(s) left
                {/* Срок — только когда за окно был расход: иначе это была бы выдуманная цифра. */}
                {row.daysLeft !== null && (
                  <> · about <strong>{row.daysLeft}</strong> day(s) left at {row.perDay}/day</>
                )}
                {row.gamesRunningOutSoon > 0 && (
                  <> · <strong>{row.gamesRunningOutSoon}</strong> game(s) run out within {soonDays} days</>
                )}
                {row.needRestock.length > 0 && (
                  <> · waiting for refill: {row.needRestock.map((game) => game.title).join(', ')}</>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headStyle}>Region</th>
            <th style={headStyle}>Available</th>
            <th style={headStyle}>Delivered</th>
            <th style={headStyle}>Games with keys</th>
            <th style={headStyle}>Days left</th>
            <th style={headStyle}>Waiting for refill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <React.Fragment key={row.offerKey}>
              <tr>
                <td style={cellStyle}>
                  {/* Строка раскрывается: «46 игр» не отвечает на вопрос, какие именно. */}
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === row.offerKey ? null : row.offerKey)}
                    aria-expanded={expanded === row.offerKey}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                  >
                    <strong>{expanded === row.offerKey ? '▾' : '▸'} {row.title}</strong>
                  </button>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {row.summary}
                    {row.exclusions ? ` · ${row.exclusions}` : ''}
                  </div>
                </td>
                <td style={{ ...cellStyle, fontWeight: 700, color: stateOf(row.available, lowThreshold).color }}>
                  {row.available}
                </td>
                <td style={cellStyle}>{row.delivered}</td>
                <td style={cellStyle}>{row.gamesInStock}</td>
                <td style={cellStyle}>
                  {row.daysLeft === null ? (
                    // Ничего не продавалось — прогноза нет. Прочерк честнее, чем «хватит навсегда».
                    <span style={{ color: '#9ca3af' }} title={'No deliveries in the last ' + windowDays + ' days'}>—</span>
                  ) : (
                    <>
                      <strong style={{ color: row.daysLeft <= soonDays ? OUT : row.daysLeft <= soonDays * 3 ? LOW : '#1f2937' }}>
                        {row.daysLeft}
                      </strong>
                      <div style={{ fontSize: 12, color: '#6b7280' }} title={'Average since the first sale in the window'}>
                        {row.perDay}/day over {row.activeDays}d
                      </div>
                    </>
                  )}
                </td>
                <td style={cellStyle}>
                  {row.needRestock.length === 0 ? (
                    <span style={{ color: '#15803d' }}>—</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {row.needRestock.map((game) => (
                        <button
                          key={game.gameId}
                          type="button"
                          onClick={() => onSelectGame?.(game.gameId, game.title)}
                          title={game.delivered > 0 ? `Sold ${game.delivered}, none left` : 'Priced for this region, no keys yet'}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: onSelectGame ? 'pointer' : 'default',
                          }}
                        >
                          {game.title}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
              {expanded === row.offerKey && (
                <tr>
                  <td colSpan={6} style={{ ...cellStyle, background: '#fafafa' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      Games with keys in this region — the ones running out first.
                      {row.gamesTruncated && <> Showing the first {row.games.length}.</>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                      {row.games.map((game) => (
                        <button
                          key={game.gameId}
                          type="button"
                          onClick={() => onSelectGame?.(game.gameId, game.title)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            cursor: onSelectGame ? 'pointer' : 'default',
                            font: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {game.title}
                            {/* Пометка по скорости, а не по остатку: она отвечает «когда кончится». */}
                            {game.daysLeft !== null && game.daysLeft <= soonDays && (
                              <span
                                style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#fef2f2', color: OUT, fontSize: 11, fontWeight: 700 }}
                                title={'Selling ' + game.perDay + '/day (measured over ' + game.activeDays + ' active day(s))'}
                              >
                                ~{game.daysLeft}d left
                              </span>
                            )}
                          </span>
                          <span style={{ whiteSpace: 'nowrap' }}>
                            <strong style={{ color: game.available === 0 ? OUT : game.available <= lowThreshold ? LOW : '#1f2937' }}>
                              {game.available}
                            </strong>
                            {game.perDay !== null ? (
                              <span style={{ color: '#9ca3af', fontSize: 12 }} title={'Since the first sale: ' + game.activeDays + ' day(s)'}> · {game.perDay}/day</span>
                            ) : game.delivered > 0 ? (
                              <span style={{ color: '#9ca3af', fontSize: 12 }}> · sold {game.delivered}</span>
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default KeyRegionStock;
