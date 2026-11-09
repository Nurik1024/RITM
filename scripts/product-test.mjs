import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, shiftDate, weekday, monthDays, scheduled, editableDate, totalXp, monthStats } from '../lib/habits.ts';

const habit = (overrides = {}) => ({
  id: 'running', title: 'Бег', emoji: '🏃', color: '#a594ff',
  days: [1, 3, 5], createdDate: '2026-11-10', archived: false, archivedDate: null, ...overrides,
});

test('monthly Monday/Wednesday/Friday schedule begins on creation and repeats in December', () => {
  const run = habit();
  assert.deepEqual(monthDays('2026-11').filter((d) => scheduled(run, d)), [
    '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20',
    '2026-11-23', '2026-11-25', '2026-11-27', '2026-11-30',
  ]);
  assert.equal(monthDays('2026-12').filter((d) => scheduled(run, d)).length, 13);
  assert.equal(monthStats([run], [], '2026-10', '2026-11-20').planned, 0);
});

test('multiple habits: resting days are excluded, future work remains pending, misses keep history', () => {
  const run = habit();
  const read = habit({ id: 'reading', days: [1, 2, 3, 4, 5, 6, 7], createdDate: '2026-11-19' });
  const marks = [
    ...['2026-11-11', '2026-11-13', '2026-11-16'].map((date) => ({ habitId: 'running', date, status: 'done' })),
    { habitId: 'running', date: '2026-11-18', status: 'missed' },
    { habitId: 'reading', date: '2026-11-19', status: 'done' },
    { habitId: 'reading', date: '2026-11-20', status: 'missed' },
  ];
  assert.deepEqual(monthStats([run, read], marks, '2026-11', '2026-11-20'), {
    planned: 21, done: 4, missed: 2, remaining: 15, percent: 19,
  });
  assert.equal(totalXp(marks), 100);
});

test('today/yesterday editing respects schedule and creation date, including month rollover', () => {
  const daily = habit({ days: [1, 2, 3, 4, 5, 6, 7], createdDate: '2026-11-30' });
  assert.equal(editableDate(daily, '2026-11-30', '2026-12-01'), true);
  assert.equal(editableDate(daily, '2026-12-01', '2026-12-01'), true);
  assert.equal(editableDate(daily, '2026-11-29', '2026-12-01'), false);
  assert.equal(editableDate(daily, '2026-12-02', '2026-12-01'), false);
  assert.equal(editableDate(habit(), '2026-11-10', '2026-11-11'), false); // Tuesday is rest.
  assert.equal(editableDate(habit(), '2026-11-09', '2026-11-10'), false); // Before creation.
  assert.equal(editableDate(habit({ archived: true }), '2026-11-11', '2026-11-11'), false);
});

test('archive cuts off future schedule without deleting XP or previous results', () => {
  const archived = habit({ archived: true, archivedDate: '2026-11-20' });
  const marks = [{ habitId: 'running', date: '2026-11-11', status: 'done' }];
  assert.equal(monthStats([archived], marks, '2026-11', '2026-11-30').planned, 5);
  assert.equal(monthStats([archived], marks, '2026-12', '2026-12-01').planned, 0);
  assert.equal(totalXp(marks), 25);
});

test('XP cannot be multiplied by retrying and is reversed when completion is replaced', () => {
  const done = { habitId: 'running', date: '2026-11-11', status: 'done' };
  assert.equal(totalXp([done, done, done]), 25);
  assert.equal(totalXp([done, { ...done, status: 'missed' }]), 0);
  assert.equal(totalXp([done, { ...done, habitId: 'reading' }]), 50);
});

test('account date is timezone-based; DST and leap/month boundaries do not skip days', () => {
  const instant = new Date('2026-11-09T20:15:00Z');
  assert.equal(dateKey(instant, 'Asia/Qyzylorda'), '2026-11-10');
  assert.equal(dateKey(instant, 'America/Los_Angeles'), '2026-11-09');
  assert.equal(shiftDate('2026-03-09', -1), '2026-03-08');
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDate('2027-01-01', -1), '2026-12-31');
  assert.equal(monthDays('2028-02').length, 29);
  assert.equal(monthDays('2027-02').length, 28);
  assert.equal(weekday('2026-11-09'), 1);
  assert.equal(weekday('2026-11-15'), 7);
});

test('empty and fully completed monthly plans have defined percentages', () => {
  assert.deepEqual(monthStats([], [], '2026-11', '2026-11-20'), { planned: 0, done: 0, missed: 0, remaining: 0, percent: 0 });
  const run = habit();
  const marks = monthDays('2026-11').filter((d) => scheduled(run, d)).map((date) => ({ habitId: run.id, date, status: 'done' }));
  assert.equal(monthStats([run], marks, '2026-11', '2026-12-01').percent, 100);
});
