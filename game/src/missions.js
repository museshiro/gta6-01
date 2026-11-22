// SOLMAR HEAT 3D — missions.js
// The story of Leo Marín and the ten jobs that pay off his debt to Viktor
// Kroll on volcanic Isla Solmar. Each mission has stages, a map marker, an
// objective line and a reward. The fixer's briefings, the courier, the
// guards, the bank job, the street race, the repo job, the tail, the smash
// & grab and the Ember Summit finale are all driven from here.
// Missions 0-4 are the original five jobs, untouched; missions 5-9 reuse
// their mechanics (checkpoints, timers, guards, escapes) so nothing new
// can break the tested path.
const STORY_INTRO = [
  'Isla Solmar. A volcanic island, three years inside, and Leo Marín is out.',
  'He owes Viktor Kroll $50,000 — and Kroll collects.',
  'Fixer Nadia Voss has work. Ten jobs. Then the debt is gone.',
];
const RESPECT_RANKS = [
  { at: 0, name: 'Street' },
  { at: 3, name: 'Hustler' },
  { at: 6, name: 'Made' },
  { at: 9, name: 'King of Solmar' },
];

function createMissions(G) {
  const M = {
    idx: -1, // -1 = no mission yet; 0..9 active; 10 = story complete
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
    // Progression: respect rank + district standing.
    completed: 0,
    standing: { Downtown: 0, 'The Docks': 0, 'Palm Court': 0, 'Ember Hills': 0, 'Solmar Beach': 0 },
    // Mission 5 (race): gates + rival.
    raceGates: [], raceGate: 0, raceT: 0, rival: null, rivalGate: 0, rivalTarget: null,
    // Mission 6 (repo): the exact car to steal.
    repoCar: null,
    // Mission 7 (tail): target ped + timers.
    tailTarget: null, tailT: 0, tailLostT: 0,
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
  function respectName() {
    let name = RESPECT_RANKS[0].name;
    for (const r of RESPECT_RANKS) if (M.completed >= r.at) name = r.name;
    return name;
  }
  function completeMission(reward, doneText) {
    const pl = G.player;
    pl.cash += reward;
    M.completed++;
    const d = G.city.districtAt(pl.x, pl.y);
    if (M.standing[d] !== undefined) M.standing[d]++;
    G.audio.missionDone();
    G.hud.toast('MISSION COMPLETE  +' + U.money(reward));
    G.hud.toast('Respect: ' + respectName() + '  ·  ' + d + ' standing up');
    if (doneText) G.hud.showDialog('Job done', [doneText]);
    G.saveGame();
    // Clean up mission-5 rival / mission-6 repo car.
    if (M.rival) { M.rival.driver = 'traffic'; M.rival = null; M.rivalTarget = null; }
    if (M.repoCar) M.repoCar = null;
    if (M.tailTarget) { M.tailTarget.mission = null; M.tailTarget = null; }
    M.idx++;
    M.stage = 0;
    M.marker = null;
    M.courier = null;
    M.guards = [];
    M.packageTaken = false;
    M.cashTaken = false;
    if (M.idx >= 10) {
      G.onStoryComplete();
      return;
    }
    startMission(M.idx);
  }
  // A failed job restarts itself (race lost, tail spotted, target lost).
  function failMission(reason) {
    G.hud.toast(reason + ' — job failed, try again');
    G.audio.busted();
    if (M.rival) { M.rival.driver = 'traffic'; M.rival = null; M.rivalTarget = null; }
    if (M.tailTarget) { M.tailTarget.mission = null; M.tailTarget = null; }
    if (M.repoCar) M.repoCar = null;
    const i = M.idx;
    M.stage = 0;
    startMission(i);
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
      G.player.grantWeapon('pistol', 24);
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
    } else if (i === 5) {
      briefing('NADIA VOSS — EMBER GRAND PRIX', [
        'Street race, Leo. Five gates around the island,',
        'against Rico in the black Vortex. Beat him to the',
        'last gate and the purse is yours. 150 seconds.',
      ]);
      M.raceGates = [
        { x: 1020, y: 220 }, { x: 2220, y: 220 }, { x: 2220, y: 1820 },
        { x: 620, y: 1820 }, { x: 620, y: 620 },
      ];
      M.raceGate = 0; M.rivalGate = 0; M.raceT = 150;
      const pl = G.player;
      const start = { x: 1020, y: 620 };
      M.rival = G.vehicles.spawnRival(start.x + 60, start.y);
      M.rival.angle = -Math.PI / 2;
      M.rivalTarget = M.raceGates[0];
      setObjective('Race! Gate 1/5 — beat Rico to the last gate', { x: 1020, y: 220, label: 'Gate 1/5' });
      G.hud.toast('Get in a car and hit the gates — Rico is already rolling');
    } else if (i === 6) {
      briefing('NADIA VOSS — THE COLLECTOR', [
        'A client in Ember Hills is behind on payments.',
        'His gold Vortex GT is parked up the hill. Take it —',
        'that exact car, no substitutes — and bring it to me.',
      ]);
      const spot = G.city.pointNear(620, 220, 60, 160);
      M.repoCar = G.vehicles.makeCar(spot.x, spot.y, Math.PI / 2, 'sports', 'parked');
      setObjective('Steal the gold Vortex GT in Ember Hills', { x: spot.x, y: spot.y, label: 'Gold Vortex GT' });
    } else if (i === 7) {
      briefing('NADIA VOSS — EYES ON KROLL', [
        'Kroll\'s man walks the Palm Court every afternoon.',
        'Tail him for a full minute. Stay 60 to 180 feet back.',
        'Get too close and he makes you. Lose him and he is gone.',
      ]);
      const c = G.city.buildingCenter(L.motel);
      M.tailTarget = G.peds.makePed(c.x - 120, c.y + 200, { mission: 'tail', hp: 80, color: '#1d2733' });
      M.tailT = 0; M.tailLostT = 0;
      setObjective('Tail Kroll\'s man — 60s, keep 60–180 away', { x: c.x - 120, y: c.y + 200, label: 'Tail target' });
    } else if (i === 8) {
      briefing('NADIA VOSS — GLASS HOUSE', [
        'Ember Jewels, Downtown. In, smash the case, grab the',
        'stones, out. The alarm brings four stars — and the',
        'SMG is yours if you pull it off. Lose the heat after.',
      ]);
      setObjective('Drive to Ember Jewels, Downtown', markerAt(L.jewels, 'Ember Jewels'));
    } else if (i === 9) {
      briefing('NADIA VOSS — EMBER SUMMIT', [
        'Last one, Leo. A package for the observatory on',
        'Mount Ember — then the whole island comes for you.',
        'Five stars. Get it to the safehouse and the debt dies.',
      ]);
      setObjective('Drive to the Ember Observatory', markerAt(L.observatory, 'Ember Observatory'));
    }
  }

  function update(dt) {
    const pl = G.player;
    const L = G.city.landmarks;
    if (M.idx < 0 || M.idx >= 10) return;
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
    } else if (M.idx === 5) {
      // Ember Grand Prix: 5 gates in order, beat Rico, 150s.
      M.raceT -= dt;
      const gate = M.raceGates[M.raceGate];
      if (gate && U.dist(pl.x, pl.y, gate.x, gate.y) < 100) {
        M.raceGate++;
        G.audio.coin();
        if (M.raceGate >= M.raceGates.length) {
          completeMission(1500, 'Rico ate your dust. The purse is yours — and the island noticed.');
          return;
        }
        const g = M.raceGates[M.raceGate];
        setObjective('Race! Gate ' + (M.raceGate + 1) + '/5 — beat Rico to the last gate', { x: g.x, y: g.y, label: 'Gate ' + (M.raceGate + 1) + '/5' });
        G.hud.toast('Gate ' + M.raceGate + '/5!');
      }
      // Rival progress through the same gates.
      if (M.rival && !M.rival.disabled) {
        const rg = M.raceGates[M.rivalGate];
        if (rg) {
          M.rivalTarget = rg;
          if (U.dist(M.rival.x, M.rival.y, rg.x, rg.y) < 100) {
            M.rivalGate++;
            if (M.rivalGate >= M.raceGates.length) {
              failMission('Rico finished first');
              return;
            }
          }
        }
      }
      if (M.raceT <= 0) { failMission('Out of time — the race is over'); return; }
      if (M.raceGate < M.raceGates.length) {
        setObjective('Race! Gate ' + (M.raceGate + 1) + '/5 — ' + Math.ceil(M.raceT) + 's left (Rico: gate ' + (M.rivalGate + 1) + '/5)', M.marker);
      }
    } else if (M.idx === 6) {
      // Repo job: steal the exact gold Vortex GT, deliver to the garage.
      if (M.stage === 0) {
        if (pl.inCar === M.repoCar) {
          M.stage = 1;
          setObjective('That\'s the one! Deliver it to Nadia\'s Garage', markerAt(L.garage, "Nadia's Garage"));
          G.hud.toast('Gold Vortex secured — go!');
        } else if (pl.inCar) {
          setObjective('Wrong car — steal the gold Vortex GT in Ember Hills', M.marker);
        }
      } else if (M.stage === 1) {
        const m = markerAt(L.garage);
        if (pl.inCar === M.repoCar && U.dist(pl.x, pl.y, m.x, m.y) < 110) {
          completeMission(1200, 'Clean repo. The client will think twice before missing a payment.');
        } else if (!pl.inCar) {
          M.stage = 0;
          setObjective('Steal the gold Vortex GT in Ember Hills', M.marker);
        }
      }
    } else if (M.idx === 7) {
      // The tail: 60s cumulative at 60-180 from the target.
      if (!M.tailTarget || M.tailTarget.state === 'down') { failMission('The target is gone'); return; }
      const d = U.dist(pl.x, pl.y, M.tailTarget.x, M.tailTarget.y);
      if (d < 55) {
        failMission('You were spotted — too close');
        return;
      }
      if (d >= 60 && d <= 180) {
        M.tailT += dt;
        M.tailLostT = 0;
        setObjective('Tail Kroll\'s man — ' + Math.ceil(60 - M.tailT) + 's to go, stay back', { x: M.tailTarget.x, y: M.tailTarget.y, label: 'Tail target' });
        if (M.tailT >= 60) {
          completeMission(900, 'He led you straight to Kroll\'s stash house. Nadia is impressed.');
          return;
        }
      } else {
        if (d > 300) {
          M.tailLostT += dt;
          if (M.tailLostT > 5) { failMission('You lost the target'); return; }
        }
        setObjective('Tail Kroll\'s man — get closer (60–180), ' + Math.ceil(60 - M.tailT) + 's left', { x: M.tailTarget.x, y: M.tailTarget.y, label: 'Tail target' });
      }
    } else if (M.idx === 8) {
      // Smash & grab at Ember Jewels.
      if (M.stage === 0) {
        const m = markerAt(L.jewels);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          if (pl.inCar) {
            setObjective('Get out and go inside Ember Jewels (on foot)', markerAt(L.jewels, 'Ember Jewels'));
          } else {
            M.stage = 1;
            M.grabT = 0;
            setObjective('Smashing the case — stay inside...');
          }
        }
      } else if (M.stage === 1) {
        const m = markerAt(L.jewels);
        if (pl.inCar) { M.stage = 0; setObjective('Drive to Ember Jewels, Downtown', markerAt(L.jewels, 'Ember Jewels')); }
        else if (U.dist(pl.x, pl.y, m.x, m.y) < 130) {
          M.grabT += dt;
          if (M.grabT > 0.1 && M.grabT < 3) {
            setObjective('Smashing the case... ' + Math.ceil(3 - M.grabT) + 's');
          }
          if (M.grabT >= 3) {
            M.stage = 2;
            G.police.addHeat(85, 'The jewel alarm is screaming — four stars!');
            G.player.grantWeapon('smg', 90);
            G.audio.coin();
            setObjective('GO! Lose the heat and reach the Safehouse', markerAt(L.safehouse, 'Safehouse'));
            G.hud.toast('Stones secured — and an SMG for the trouble. RUN!');
          }
        } else {
          M.grabT = Math.max(0, M.grabT - dt * 2);
        }
      } else if (M.stage === 2) {
        const m = markerAt(L.safehouse);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120 && G.police.wanted.level <= 2) {
          completeMission(2500, 'The stones are fenced. Two jobs left, Leo.');
        } else if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          setObjective('Lose the cops first! (' + G.police.wanted.level + ' stars)');
        }
      }
    } else if (M.idx === 9) {
      // Finale: the Ember Summit.
      if (M.stage === 0) {
        const m = markerAt(L.observatory);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          if (pl.inCar) {
            setObjective('Get out — deliver the package on foot', markerAt(L.observatory, 'Ember Observatory'));
          } else {
            M.stage = 1;
            M.grabT = 0;
            setObjective('Handing over the package...');
          }
        }
      } else if (M.stage === 1) {
        const m = markerAt(L.observatory);
        if (pl.inCar) { M.stage = 0; setObjective('Drive to the Ember Observatory', markerAt(L.observatory, 'Ember Observatory')); }
        else if (U.dist(pl.x, pl.y, m.x, m.y) < 130) {
          M.grabT += dt;
          if (M.grabT >= 2) {
            M.stage = 2;
            G.police.addHeat(100, 'Five stars — the whole SMPD is coming for you');
            setObjective('FIVE STARS! Lose them and reach the Safehouse', markerAt(L.safehouse, 'Safehouse'));
            G.hud.toast('The package is delivered — now RUN!');
          }
        } else {
          M.grabT = Math.max(0, M.grabT - dt * 2);
        }
      } else if (M.stage === 2) {
        const m = markerAt(L.safehouse);
        if (U.dist(pl.x, pl.y, m.x, m.y) < 120 && G.police.wanted.level <= 1) {
          completeMission(15000, 'Debt paid. Kroll is square. Isla Solmar is yours, Leo.');
        } else if (U.dist(pl.x, pl.y, m.x, m.y) < 120) {
          setObjective('Lose the cops first! (' + G.police.wanted.level + ' stars)');
        }
      }
    }
  }

  // Attach the methods to the live mission state itself (no copy: the
  // closure and the caller read the same object).
  M.STORY_INTRO = STORY_INTRO;
  M.RESPECT_RANKS = RESPECT_RANKS;
  M.startMission = startMission;
  M.completeMission = completeMission;
  M.failMission = failMission;
  M.respectName = respectName;
  M.update = update;
  return M;
}
