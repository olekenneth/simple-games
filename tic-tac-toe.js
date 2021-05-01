var Game = function(eventhub) {
  let playerId = Math.random().toString(16).substr(2);
  let gameId = null;
  let gameLock = true;
  let players = ['❌', '⭕️'];
  let currentPlayer = players[1];
  let state = [['❓','❓','❓'], ['❓','❓','❓'], ['❓','❓','❓']];

  function drawGame() {
    console.clear();
    state.reverse().map((t) => {
      console.log('%c' + '_'.repeat(11), 'margin-top: -20px;font-weight:bold; font-size: 24px');
      console.log('%c' + t.join(' | '), 'font-weight:bold; margin:0; font-size: 24px');
    });
    state.reverse();

    decideWinner()
      .then((winner) => {
        gameLock = true;
        window.alert('Winner is ' + winner);
        eventhub.unsubscribeAll();
        new Game(eventhub);
      })
      .catch(decideNextPlayer);
  };

  function publishState() {
    if (!gameId) return;
    eventhub.publish('ttt/games/' + gameId, JSON.stringify({ state: state, playerId: playerId }));
  };

  function joinGame(newGameId) {
    if (gameId) return;
    gameId = newGameId;
    console.log('Joining game', gameId);
    drawGame();
    eventhub.subscribe('ttt/games/' + gameId, function (data) {
      const json = JSON.parse(data.message);
      if (json.playerId === playerId) return;
      state = json.state;
      drawGame();
    });
  }

  async function decideWinner() {
    let stateCopy = [].concat(state.map((r) => r.filter((e) => e !== '❓')));

    if (stateCopy.flat().length === 0) {
      throw Error('Not finished');
    }

    let winningScenarios = []
        .concat(stateCopy)
        .concat(stateCopy.map((r, i) => stateCopy.map((rr) => rr[i])))
        .concat([stateCopy.map((r, i) => r[i])])
        .concat([stateCopy.reverse().map((r, i) => r[i])])
        .map((r) => r.filter((e) => e))
        .filter((e) => e.length);

    for(let i in winningScenarios) {
      let r = winningScenarios[i];
      if (new Set(r).size === 1 && r.length === state[0].length) {
        console.log('We got a winner', r[0]);
        return r[0];
      }
    }
    throw Error('Not finished');
  }

  function decideNextPlayer() {
    gameLock = true;
    const isFirstPlayer = (state.flat().filter((e) => e !== '❓').length % 2 === 0);
    console.log('%cNext player is ' + players[isFirstPlayer ? 0 : 1], 'font-weight:bold; margin:0; font-size: 24px');
    if (currentPlayer.localeCompare(players[isFirstPlayer ? 0 : 1]) === 0) {
      console.log('%cIt\'s your turn. Type set(x,y) to play.', 'font-weight:bold; margin:0; font-size: 24px');
      gameLock = false;
    }
  }

  function handShake(tmpGameId, otherPlayerId) {
    if (gameId) return;
    console.log('Sending handshake to', otherPlayerId, gameId);
    eventhub.publish('ttt/games/' + otherPlayerId, JSON.stringify({
      gameId: tmpGameId,
      playerId: playerId,
    }));
  }

  // Listen for handshakes and games to join
  eventhub.subscribe('ttt/games/' + playerId, function (data) {
    const json = JSON.parse(data.message);
    if (json.playerId === playerId) return;
    // Send handshake and join
    handShake(json.gameId, json.playerId);
    if (json.gameId) {
      joinGame(json.gameId);
    }
  }).then((res) => {
    // Request new games
    eventhub.publish('ttt/games/request', JSON.stringify({ playerId: playerId }));
  });

  let to = setTimeout(() => {
    // Start new game
    eventhub.subscribe('ttt/games/request', function (data) {
      console.log('Got game request', gameId, data);
      const json = JSON.parse(data.message);
      if (json.playerId === playerId) return;
      currentPlayer = players[0];
      handShake(playerId + '-' + json.playerId, json.playerId);
    });
  }, 500);

  window.set = (x,y) => {
    if (gameLock) throw Error('Not your turn');
    if (y < 0 || y > state.length - 1) throw Error('Outside of board');
    if (x < 0 || x > state[y].length - 1) throw Error('Outside of board');
    if (state[y][x] !== '❓') throw Error('Occupied');
    state[y][x] = currentPlayer;
    drawGame();
    publishState();
  };
};

var load = function (w, d, s, cb) {
  var t = 'script';
  var a = d.createElement(t);
  var b = d.getElementsByTagName(t)[0];
  a.onload = cb;
  a.async = 1;
  a.src = s;
  b.parentNode.insertBefore(a, b);
};
load(window, document, '//cdn.vgc.no/js/libs/eventhub-js/eventhub.umd.js?_3', () => {
  let eventhub = new Eventhub('wss://direktehub.vg.no', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWFkIjpbInR0dC8jIl0sIndyaXRlIjpbInR0dC8jIl19._z2FcA2SRzk-10ORwdLYy427eu36MzFMjp3l2bYA2hI');
  eventhub.connect().then(() => new Game(eventhub));
});
