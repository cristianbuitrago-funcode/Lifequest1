/*
 * Acciones de juego: aplican el motor de reglas al estado y lo persisten.
 * No tocan el DOM: devuelven un resultado y la UI decide qué mostrar.
 */
(function (LQ) {
  "use strict";

  const { HABIT_LADDER } = LQ.config;
  const { todayStr, yesterdayStr } = LQ.utils;
  const Rules = LQ.Rules;
  const state = LQ.state;
  const store = LQ.store;

  function grantReward(xp, coins){
    state.character.totalXp = (state.character.totalXp||0) + xp;
    state.character.coins = Math.max(0, (state.character.coins||0) + coins);
    const today = todayStr(), yest = yesterdayStr();
    const action = Rules.nextStreak(state.character.lastActiveDate, today, yest);
    if (action === 'inc') state.character.streak = (state.character.streak||0) + 1;
    else if (action === 'reset') state.character.streak = 1;
    state.character.lastActiveDate = today;
  }

  /** @returns {Promise<null|{xp:number, coins:number, title:string}>} */
  async function completeQuest(id){
    const q = state.quests.find(x=>x.id===id);
    if (!q || !q.active) return null;
    const today = todayStr();
    if (q.recurrence === 'diaria' && q.lastCompletedDate === today) return null;
    const r = Rules.reward(q.difficulty, state.settings);
    grantReward(r.xp, r.coins);
    const patch = {lastCompletedDate: today, lastPunishedDate: null};
    if (q.recurrence === 'unica') patch.active = false;
    await store.updateQuest(id, patch);
    await store.addCompletion({questId:id, questTitle:q.title, categoryId:q.categoryId, xp:r.xp, coins:r.coins, date:today});
    await store.saveCharacter();
    return {xp:r.xp, coins:r.coins, title:q.title};
  }

  /** Castigo por misiones diarias no cumplidas ayer y reinicio de racha. */
  async function checkMissedDaily(){
    const today = todayStr(), yest = yesterdayStr();
    let punished = false;
    const writes = [];
    state.quests.forEach(q=>{
      if (q.recurrence !== 'diaria' || !q.active) return;
      if (q.lastPunishedDate === today) return;
      const existedYesterday = q.createdAt && q.createdAt <= yest;
      const missedYesterday = existedYesterday && q.lastCompletedDate !== yest && q.lastCompletedDate !== today;
      if (missedYesterday){
        state.character.coins = Math.max(0, (state.character.coins||0) - state.settings.punishmentCoins);
        writes.push(store.updateQuest(q.id, {lastPunishedDate: today}));
        punished = true;
      }
    });
    let streakReset = false;
    if (state.character.lastActiveDate && state.character.lastActiveDate !== today && state.character.lastActiveDate !== yest){
      streakReset = state.character.streak !== 0;
      state.character.streak = 0;
    }
    if (punished || streakReset) writes.push(store.saveCharacter());
    await Promise.all(writes);
    return {punished};
  }

  /** Marca/desmarca el hábito hoy y otorga la escalera de recompensas. */
  async function habitCheckIn(id){
    const h = state.habits.find(x=>x.id===id); if (!h) return null;
    const today = todayStr();
    const log = Object.assign({}, h.log||{});
    log[today] = !log[today];
    const info = Rules.habitStreakInfo(log);
    const claimed = (h.claimedTiers||[]).slice();
    let bonus = 0;
    HABIT_LADDER.forEach(t=>{
      if (info.streak >= t.days && claimed.indexOf(t.days) === -1){
        claimed.push(t.days);
        bonus += t.reward;
      }
    });
    if (bonus > 0){
      state.character.coins = (state.character.coins||0) + bonus;
      await store.saveCharacter();
    }
    await store.updateHabit(id, {log, claimedTiers: claimed});
    return {bonus, streak: info.streak};
  }

  LQ.Game = { grantReward, completeQuest, checkMissedDaily, habitCheckIn };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
