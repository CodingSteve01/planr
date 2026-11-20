// The people-load model: holidays, vacation bands, per-person weekly load and the
// summaries the load tips are built from. Inputs in, value out.
import { iso, addD, localDate } from '../date.js';
import { deriveCap, memberAtDate } from '../capacity.js';
import { scheduleEffort } from '../scheduler.js';
import { tipLines } from '../tipText.js';
import { EMPTY_ARR, fmtLoadDays, personIdsOf } from './helpers.js';

export function buildHolidayDays(ctx) {
  const { weeks, wdSet, WPX, DPX } = ctx;
  const out = [];
  weeks.forEach((w, i) => {
    const wds = new Set((w.wds || []).map(d => d.getTime()));
    for (let d = 0; d < 7; d++) {
      const date = addD(w.mon, d);
      if (wdSet.has(date.getDay()) && !wds.has(date.getTime())) out.push({ x: i * WPX + d * DPX, iso: iso(date) });
    }
  });
  return out;
}

export function buildVacBands(ctx) {
  const { allItems, vacByPerson, memberById, tw, DPX, dateToX } = ctx;
  const bands = {};
  allItems.forEach(s => {
    const assigneeIds = [...new Set([...(s.assign || []), ...(s.personId ? [s.personId] : [])])];
    if (!assigneeIds.length) return;
    const slots = [];
    assigneeIds.forEach(pid => {
      const pvacs = vacByPerson[pid];
      if (!pvacs?.length) return;
      pvacs.forEach(v => {
        const x1 = dateToX(localDate(v.from));
        const x2 = dateToX(addD(localDate(v.to), 1));
        if (x2 <= 0 || x1 >= tw) return;
        slots.push({
          pid,
          personName: memberById[pid]?.name || pid,
          note: v.note || '',
          from: v.from,
          to: v.to,
          width: Math.max(x2 - x1, DPX),
          x1,
          x2,
        });
      });
    });
    if (!slots.length) return;
    const personOrder = [...new Set(slots.map(sl => sl.pid))];
    const personIndex = Object.fromEntries(personOrder.map((pid, idx) => [pid, idx]));
    const nBands = personOrder.length;
    bands[s.id] = slots.map((sl, idx) => {
      // One strip per person away, stacked: `lane` is which strip, counted
      // from the row's baseline upwards. It used to be a pixel band that
      // split the row's full height between them, which is what made two
      // people on holiday fill the row twice over.
      const lane = personIndex[sl.pid] ?? 0;
      return {
        key: `vac-${sl.pid}-${idx}`,
        personName: sl.personName,
        firstName: sl.personName.split(' ')[0] || sl.personName,
        note: sl.note,
        from: sl.from,
        to: sl.to,
        nBands,
        lane,
        width: sl.width,
        x1: sl.x1,
      };
    });
  });
  return bands;
}

export function buildResourceLoad(ctx) {
  const { allItems, iMap, memberById, members, vacByPerson, weeks, meetingPlans, teams, todayIso, capacityAt, scheduledWorkDaysOf } = ctx;
  const result = {};
  const isActiveMemberDay = (member, date) => {
    if (!member) return false;
    const d = date instanceof Date ? date : localDate(date);
    if (member.start && d < localDate(member.start)) return false;
    if (member.end && d > localDate(member.end)) return false;
    return true;
  };
  const onVacation = (personId, date) => {
    const d = date instanceof Date ? date : localDate(date);
    return (vacByPerson[personId] || EMPTY_ARR).some(v => d >= localDate(v.from) && d <= localDate(v.to));
  };
  const ensure = personId => {
    if (result[personId]) return result[personId];
    result[personId] = weeks.map((week, wi) => ({
      wi,
      kw: week.kw,
      start: iso(week.mon),
      end: iso(week.sun || (week.wds || EMPTY_ARR)[(week.wds || EMPTY_ARR).length - 1] || week.mon),
      availability: 0,
      load: 0,
      taskCount: 0,
      tasks: [],
    }));
    return result[personId];
  };

  for (const member of members || EMPTY_ARR) {
    const rows = ensure(member.id);
    weeks.forEach((week, wi) => {
      let availability = 0;
      (week.wds || EMPTY_ARR).forEach(date => {
        if (!isActiveMemberDay(member, date) || onVacation(member.id, date)) return;
        availability += Math.max(0, capacityAt?.(member.id, date) ?? deriveCap(memberAtDate(member, date), { plans: meetingPlans, teams }));
      });
      rows[wi].availability = availability;
    });
  }

  for (const item of allItems || EMPTY_ARR) {
    if (!item.startD || !item.endD || item._unestimated || (item.isHandoff && item.unscheduled)) continue;
    const personIds = personIdsOf(item).filter(id => memberById[id]);
    if (!personIds.length) continue;
    const start = item.startD instanceof Date ? item.startD : localDate(item.startD);
    const end = item.endD instanceof Date ? item.endD : localDate(item.endD);
    const node = iMap[item.treeId || item.id] || item;
    const effort = Math.max(0, item.effort || scheduleEffort(node) || scheduledWorkDaysOf(item));
    // Distribute effort only over days the person actually works. Vacation
    // and off-roster days stretch the calendar duration of the bar but do
    // not contribute to load — otherwise a task spanning a vacation week
    // would falsely flag the resource as over-booked.
    personIds.forEach(personId => {
      const rows = ensure(personId);
      const member = memberById[personId];
      const personSlots = [];
      weeks.forEach((week, wi) => {
        (week.wds || EMPTY_ARR).forEach(date => {
          if (date < start || date > end) return;
          if (!isActiveMemberDay(member, date)) return;
          if (onVacation(personId, date)) return;
          personSlots.push({ wi });
        });
      });
      if (!personSlots.length) return;
      const loadPerSlot = effort / personSlots.length;
      const loadByWeek = new Map();
      personSlots.forEach(({ wi }) => {
        rows[wi].load += loadPerSlot;
        loadByWeek.set(wi, (loadByWeek.get(wi) || 0) + loadPerSlot);
      });
      loadByWeek.forEach((load, wi) => {
        const status = item.status || node?.status || '';
        const startIso = item.startD ? iso(item.startD) : '';
        const endIso = item.endD ? iso(item.endD) : '';
        rows[wi].tasks.push({
          id: item.treeId || item.id,
          name: item.name || node?.name || item.id,
          load,
          status,
          start: startIso,
          end: endIso,
          done: status === 'done',
        });
      });
    });
  }

  Object.values(result).forEach(rows =>
    rows.forEach(row => {
      row.percent = row.availability > 0 ? Math.round((row.load / row.availability) * 100) : row.load > 0 ? 999 : 0;
      row.tasks.sort((a, b) => b.load - a.load || a.id.localeCompare(b.id, undefined, { numeric: true }));
      row.taskCount = row.tasks.length;
      row.openTaskCount = row.tasks.filter(task => task.status !== 'done').length;
      row.hasOpenWork = row.openTaskCount > 0;
      row.historicalOnly = row.load > 0 && !row.hasOpenWork;
      row.currentOrFuture = !row.end || row.end >= todayIso;
      row.isPlanningRisk = row.load > 0 && row.hasOpenWork && row.currentOrFuture && row.percent >= 90;
    }),
  );
  return result;
}

export function buildLoadRiskSummary(ctx) {
  const { resourceLoadByWeek, memberById, t } = ctx;
  const risky = [];
  const historical = [];
  Object.entries(resourceLoadByWeek || {}).forEach(([personId, rows]) => {
    const name = memberById[personId]?.name || personId;
    (rows || EMPTY_ARR).forEach(row => {
      if (!row || row.load <= 0 || row.percent < 90) return;
      const entry = {
        personId,
        name,
        kw: row.kw,
        start: row.start,
        load: row.load,
        availability: row.availability,
        percent: row.percent,
        tasks: row.tasks || EMPTY_ARR,
      };
      if (row.isPlanningRisk) risky.push(entry);
      else if (row.historicalOnly) historical.push(entry);
    });
  });
  risky.sort((a, b) => b.percent - a.percent || b.load - a.load);
  historical.sort((a, b) => b.percent - a.percent || b.load - a.load);
  const over = risky.filter(r => r.percent > 110);
  const full = risky.filter(r => r.percent >= 90 && r.percent <= 110);
  const top = risky.slice(0, 6);
  const histTop = historical.slice(0, Math.max(0, 6 - top.length));
  const weekLine = (r, bold) =>
    `${r.name} · KW ${r.kw} (${r.start}): ${bold ? `**${r.percent}%**` : `${r.percent}%`} · ${fmtLoadDays(r.load)} / ${fmtLoadDays(r.availability)}`;
  const taskLines = (r, limit) =>
    (r.tasks || EMPTY_ARR).slice(0, limit).map(task => `- ${task.id} ${task.name} · ${fmtLoadDays(task.load)}`);
  const riskLines = top.flatMap(r => [weekLine(r, true), ...taskLines(r, 3)]);
  const histLines = histTop.flatMap(r => [weekLine(r, false), ...taskLines(r, 2)]);
  const tip =
    top.length || histTop.length
      ? tipLines(
          `**${t('g.loadRiskTitle')}**`,
          ...riskLines,
          `__${riskLines.length ? t('g.loadRiskAction') : t('g.loadOkTip')}__`,
          ...(histLines.length ? ['', `**${t('g.loadHistoryTitle')}**`, ...histLines, `__${t('g.loadHistoryNote')}__`] : []),
        )
      : t('g.loadOkTip');
  return {
    overCount: over.length,
    fullCount: full.length,
    maxPercent: risky[0]?.percent || 0,
    historicalCount: historical.length,
    tip,
  };
}

export function buildLoadWeekSummary(ctx) {
  const { weeks, resourceLoadByWeek, memberById, t } = ctx;
  return weeks.map((week, wi) => {
    const people = Object.entries(resourceLoadByWeek || {})
      .map(([personId, rows]) => {
        const row = rows?.[wi];
        if (!row || row.load <= 0) return null;
        return {
          personId,
          name: memberById[personId]?.name || personId,
          percent: row.percent,
          load: row.load,
          availability: row.availability,
          tasks: row.tasks || EMPTY_ARR,
          hasOpenWork: row.hasOpenWork,
          historicalOnly: row.historicalOnly,
          isPlanningRisk: row.isPlanningRisk,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.percent - a.percent || b.load - a.load);
    const planningPeople = people.filter(p => p.isPlanningRisk);
    const totalLoad = people.reduce((sum, p) => sum + p.load, 0);
    const totalAvailability = people.reduce((sum, p) => sum + p.availability, 0);
    const maxPercent = planningPeople[0]?.percent || people[0]?.percent || 0;
    const overCount = planningPeople.filter(p => p.percent > 110).length;
    const historicalOnly = people.length > 0 && !planningPeople.length && people.every(p => p.historicalOnly);
    const shownBase = planningPeople.length
      ? planningPeople
      : people.filter(p => p.percent >= 90).length
        ? people.filter(p => p.percent >= 90)
        : people;
    const shown = shownBase.slice(0, 8);
    const tip = people.length
      ? tipLines(
          `**${t('g.loadWeekTitle')} KW ${week.kw} · ${iso(week.mon)}**`,
          `${t('g.loadWeekTotal')}: ${fmtLoadDays(totalLoad)} / ${fmtLoadDays(totalAvailability)} · max ${maxPercent}%`,
          ...shown.flatMap(p => [
            '',
            `**${p.name}**: ${p.percent}% · ${fmtLoadDays(p.load)} / ${fmtLoadDays(p.availability)}`,
            ...(p.tasks || EMPTY_ARR).slice(0, 4).map(task => `- ${task.id} ${task.name} · ${fmtLoadDays(task.load)}`),
          ]),
          '',
          historicalOnly ? `__${t('g.loadHistoryNote')}__` : null,
          `__${t('g.loadClickResource')}__`,
        )
      : t('g.loadNoWork');
    return {
      wi,
      kw: week.kw,
      maxPercent,
      overCount,
      totalLoad,
      totalAvailability,
      historicalOnly,
      tip,
    };
  });
}

export function taskLoadCells(ctx, s, barLeft, barWidth) {
  const { showLoadHeatmap, resourceLoadByWeek, weeks, WPX } = ctx;
  if (!showLoadHeatmap || !s || s._unestimated || !barWidth) return EMPTY_ARR;
  const ids = personIdsOf(s).filter(id => resourceLoadByWeek[id]);
  if (!ids.length) return EMPTY_ARR;
  const barRight = barLeft + barWidth;
  const cells = [];
  weeks.forEach((week, wi) => {
    const cellLeft = wi * WPX;
    const cellRight = cellLeft + WPX;
    if (cellRight <= barLeft || cellLeft >= barRight) return;
    let load = 0;
    let availability = 0;
    let hasOpenWork = false;
    let isPlanningRisk = false;
    ids.forEach(id => {
      const row = resourceLoadByWeek[id]?.[wi];
      if (!row) return;
      load += row.load || 0;
      availability += row.availability || 0;
      if (row.hasOpenWork) hasOpenWork = true;
      if (row.isPlanningRisk) isPlanningRisk = true;
    });
    const percent = availability > 0 ? Math.round((load / availability) * 100) : load > 0 ? 999 : 0;
    cells.push({
      wi,
      kw: week.kw,
      percent,
      load,
      availability,
      hasOpenWork,
      isPlanningRisk,
      historicalOnly: load > 0 && !hasOpenWork,
      left: Math.max(0, cellLeft - barLeft),
      width: Math.max(1, Math.min(cellRight, barRight) - Math.max(cellLeft, barLeft)),
    });
  });
  return cells;
}
