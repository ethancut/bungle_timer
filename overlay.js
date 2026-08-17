const MAX_RECONNECT_DELAY = 10000;
const wsUri = "ws://localhost:8080/ws/timer";

const successColor = "rgb(0, 173, 0)";
const failColor = "rgb(0, 173, 0)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let reconnectDelay = 1000;
let websocket = null

const timerElement = document.getElementById('timer');
const statusElement = document.getElementById('status');


async function statusNotify(msg) {
    if (msg.reason == 'true') {
        statusElement.style.color = successColor
        statusElement.textContent = "Connected"
        await sleep(2000);
        statusElement.textContent = ""
    } else {
        statusElement.style.color = "red"
        statusElement.textContent = msg.reason
    }
}

function formatSeconds(totalSeconds) {
    if (totalSeconds <= 0 || totalSeconds == null) {
        return "00:00:00"
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return `${hh}:${mm}:${ss}`;
}


function setTime(seconds) {
    timerElement.textContent = formatSeconds(seconds)
}


function connect() {
    websocket = new WebSocket(wsUri)
    websocket.addEventListener('open', (event) => {
        console.log("connected")
        statusNotify({ reason: 'true' })
    })
    websocket.addEventListener('close', (event) => {
        statusNotify({ reason: 'Disconnected' })
        scheduleReconnect()
    })

    websocket.addEventListener('message', (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data)
        } catch (e) {
            console.log("bad message from server: ", event.data)
        }
        if (msg.type == "updateTimer") {
            console.log("time remaining: ", msg.remaining, " seconds")
            setTime(msg.remaining)
        }
    })
}

function scheduleReconnect() {
    setTimeout(() => {
        console.log(`reconnecting (delay ${reconnectDelay}ms)`);
        connect();
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }, reconnectDelay);
}

function initOverlay() {
    connect();
}


initOverlay();