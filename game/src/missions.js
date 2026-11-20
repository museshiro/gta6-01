// SOLMAR HEAT — missions.js
// The story of Leo Marín and the five jobs that pay off his debt to Viktor
// Kroll. Each mission has stages, a map marker, an objective line and a
// reward. The fixer's briefings, the courier, the guards and the bank job
// are all driven from here.
const STORY_INTRO = [
  'Solmar City. Three years inside, and Leo Marín is out.',
  'He owes Viktor Kroll $50,000 — and Kroll collects.',
  'Fixer Nadia Voss has work. Five jobs. Then the debt is gone.',
];

function createMissions(G) {
  const M = {
    idx: -1, // -1 = no mission yet; 0..4 active; 5 = story complete
    stage: 0,
    objective: 'Talk to Nadia — drive to her garage',
    marker: null, // {x, y, label}
    courier: null,
    guards: [],
    packageTaken: false,
    cashTaken: false,
    grabT: 0,
    stashes: [], // hidden cash briefcases
    stashesFound: 0,
  };

  function markerAt(landmark, label) {
    const c = G.city.buildingCenter(landmark);
    // Marker just outside the building, on the street.
    return { x: c.x, y: c.y + landmark.h / 2 + 90, label };
  }
  function setObjective(text, marker) {
    M.objective = text;
    if (marker !== undefined) M.marker = marker;
  }
  function briefing(title, lines) {
    G.hud.showDialog(title, lines);
  }
  function completeMission(reward, doneText) {
    const pl = G.player;
    pl.cash += reward;
    G.audio.missionDone();
    G.hud.toast('MISSION COMPLETE  +' + U.money(reward));
    if (doneText) G.hud.showDialog('Job done', [doneText]);
    G.saveGame();
    M.idx++;
    M.stage = 0;
    M.marker = null;
    M.courier = null;
    M.guards = [];
    M.packageTaken = false;
    M.cashTaken = false;
    if (M.idx >= 5) {
      G.onStoryComplete();
      return;
    }
    startMission(M.idx);
  }

  function startMission(i) {
    M.idx = i;
    M.stage = 0;
    const L = G.city.landmarks;
    if (i === 0) {
      briefing('NADIA VOSS — WHEELS', [
        'Leo. You need wheels before you need anything else.',
        'Jack any car on the street and bring it to my garage.',
        'Try not to make it a whole thing.',
      ]);
      setObjective('Steal a car and drive it to Nadia\'s Garage', markerAt(L.garage, "Nadia's Garage"));
    } else if (i === 1) {
      briefing('NADIA VOSS — THE PICKUP', [
        'My courier is waiting at the docks with a package.',
        'Pick him up, drop him at the Palm Court Motel.',
        'Cops are sniffing around the docks. Keep it smooth.',
      ]);
      setObjective('Pick up the courier at the Solmar Docks', markerAt(L.docks, 'Solmar Docks'));
    } else if (i === 2) {
      briefing('NADIA VOSS — HOT WHEELS', [
        'That pickup put heat on you. Two stars, Leo.',
        'Lose the cops — outrun them, lay low, or hit Turbo Respray.',
        'Get back to zero stars and call me.',
      ]);
      G.police.addHeat(42, 'The pickup put heat on you');
      setObjective('Lose the wanted level — get back to 0 stars', null);
    } else if (i === 3) {
      briefing('NADIA VOSS — THE PACKAGE', [
        'Kroll stashed a package in the Harbor Parking garage.',
        'Two of his boys are watching it. Handle them, grab it,',
        'and bring it back to your car. You have a pistol now.',
      ]);
      G.player.hasPistol = true;
      G.player.ammo += 24;
      setObjective('Get the package from Harbor Parking (on foot)', markerAt(L.parking, 'Harbor Parking'));
      // Spawn two guards at the parking garage.
      const c = G.city.buildingCenter(L.parking);
      M.guards = [
        G.peds.makePed(c.x - 60, c.y + 90, { mission: 'guard', hp: 70, color: '#2b2b2b' }),
        G.peds.makePed(c.x + 60, c.y + 90, { mission: 'guard', hp: 70, color: '#2b2b2b' }),
      ];
    } else if (i === 4) {
      briefing('NADIA VOSS — THE BIG SCORE', [
        'This is it. The Solmar Reserve. In, grab the cash, out.',
        'The whole PD will come down on you. Lose them and get',
        'to the safehouse — then we are square with Kroll.',
      ]);
      setObjective('Drive to the Solmar Reserve bank', markerAt(L.bank, 'Solmar Reserve'));
    }
  }

  function update(dt) {
    const pl = G.player;
    const L = G.city.landmarks;
    if (M.idx < 0 || M.idx >= 5) return;
    // Side stashes: sparkle pickups scattered around the city.
    if (M.stashes.length === 0) {
      for (let i = 0; i < 5; i++) {
        const p = G.city.sidewalkPoint();
        M.stashes.push({ x: p.x, y: p.y, taken: false });
      }
    }
    for (const s of M.stashes) {
      if (!s.taken && U.dist(pl.x, pl.y, s.x, s.y) < 42) {
        s.taken = true;
        M.stashesFound++;
        pl.cash += 250;
        G.audio.coin();
        G.hud.toast('Hidden stash found  +$250  (' + M.stashesFound + '/5)');
        G.addParticles(s.x, s.y, 10, '#ffd34d');
      }
    }

    if (M.idx === 0) {
      if (M.stage === 0 && pl.inCar) {
        M.stage = 1;
        setObjective('Drive the car to Nadia\'s Garage', markerAt(L.garage, "Nadia's Garage"));
      } else if (M.stage === 1) {
        const m = markerAt(L.garage);
        if (pl.inCar && U.dist(pl.x, pl.y, m.x, m.y) < 110) {
          completeMission(200, 'Nice wheels. Kroll\'s boys won\'t know what hit them. Next job soon.');
        }
      }
    } else if (M.idx === 1) {
      if (M.stage === 0) {
        const m = markerAt(L.docks);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 110) {
          M.stage = 1;
          const c = G.city.buildingCenter(L.docks);
          M.courier = G.peds.makePed(c.x + 40, c.y + 120, { mission: 'courier', hp: 60, color: '#e8e8e8' });
          G.police.addHeat(20, 'A patrol spotted the pickup');
          setObjective('The courier is in! Drive him to the Palm Court Motel', markerAt(L.motel, 'Palm Court Motel'));
          G.hud.toast('Courier picked up — go!');
        }
      } else if (M.stage === 1) {
        // Courier rides along (stays near the player).
        if (M.courier) {
          M.courier.x = pl.x - 30; M.courier.y = pl.y + 30;
          M.courier.state = 'idle';
        }
        const m = markerAt(L.motel);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 110) {
          if (M.courier) { M.courier.mission = null; M.courier.state = 'walk'; M.courier = null; }
          completeMission(400, 'Clean drop. Nadia says you drive like you mean it.');
        }
      }
    } else if (M.idx === 2) {
      if (G.police.wanted.level === 0 && G.police.wanted.heat <= 0.5) {
        completeMission(300, 'Cold again. Nadia has one more job — a real one.');
      } else {
        setObjective('Lose the wanted level — ' + G.police.wanted.level + ' star' + (G.police.wanted.level === 1 ? '' : 's') + ' (hide, outrun, or use Turbo Respray)');
      }
    } else if (M.idx === 3) {
      if (M.stage === 0) {
        const m = markerAt(L.parking);
        if (!pl.inCar && U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          M.stage = 1;
          setObjective('Take out the guards and grab the package');
        }
      } else if (M.stage === 1) {
        const alive = M.guards.filter((g) => g.hp > 0 && g.state !== 'down').length;
        if (alive === 0) {
          M.stage = 2;
          M.packageTaken = true;
          G.audio.pickup();
          setObjective('Package secured — get back in your car', null);
          G.hud.toast('Package secured!');
        }
      } else if (M.stage === 2) {
        if (pl.inCar) completeMission(600, 'That package buys a lot of goodwill. One job left, Leo.');
      }
    } else if (M.idx === 4) {
      if (M.stage === 0) {
        const m = markerAt(L.bank);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          if (pl.inCar) {
            setObjective('Get out and go inside the bank (on foot)', markerAt(L.bank, 'Solmar Reserve'));
          } else {
            M.stage = 1;
            M.grabT = 0;
            setObjective('Grabbing the cash — stay in the vault...');
          }
        }
      } else if (M.stage === 1) {
        const m = markerAt(L.bank);
        if (pl.inCar) { M.stage = 0; setObjective('Drive to the Solmar Reserve bank', markerAt(L.bank, 'Solmar Reserve')); }
        else if (U.dist(pl.x, pl.y, m.x, m.y) < 130) {
          M.grabT += dt;
          if (M.grabT > 0.1 && M.grabT < 3) {
            setObjective('Grabbing the cash... ' + Math.ceil(3 - M.grabT) + 's');
          }
          if (M.grabT >= 3) {
            M.stage = 2;
            M.cashTaken = true;
            G.police.addHeat(65, 'The bank alarm is screaming');
            G.audio.coin();
            setObjective('GO! Lose 3 stars and reach the Safehouse', markerAt(L.safehouse, 'Safehouse'));
            G.hud.toast('You got the cash — RUN!');
          }
        } else {
          M.grabT = Math.max(0, M.grabT - dt * 2);
        }
      } else if (M.stage === 2) {
        const m = markerAt(L.safehouse);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120 && G.police.wanted.level <= 1) {
          completeMission(5000, 'Debt paid. Kroll is square. Solmar is yours, Leo.');
        } else if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          setObjective('Lose the cops first! (' + G.police.wanted.level + ' stars)');
        }
      }
    }
  }

  // Attach the methods to the live mission state itself (no copy: the
  // closure and the caller read the same object).
  M.STORY_INTRO = STORY_INTRO;
  M.startMission = startMission;
  M.completeMission = completeMission;
  M.update = update;
  return M;
}
