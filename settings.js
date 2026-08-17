const wsUri = "ws://localhost:8080/ws/settings";

const settingsElements = [
    document.getElementById('bits'),
    document.getElementById('subs'),
    document.getElementById('donations')
];
const values = { bits: 0, subs: 0, donations: 0 };
const keys = ['bits', 'subs', 'donations'];
const statusElement = document.getElementById('submit-status');

let websocket = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;
function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function updateConfig(msg) {
    values.bits = msg.bits;
    values.subs = msg.subs;
    values.donations = msg.donations;
    settingsElements[0].value = msg.bits;
    settingsElements[1].value = msg.subs;
    settingsElements[2].value = msg.donations;
    validateElements();
}



function initTimer() {

    connect();
    //TODO: populate existing values
    document.getElementById('send-message').addEventListener("click", (event) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(document.getElementById('message-box').value);
        }
    });

    settingsElements.forEach((element, index) => {
        element.addEventListener('input', (event) => {
            console.log(event.target.value)
            values[keys[index]] = parseFloat(event.target.value);
            validateElements();
        });
    });
    document.getElementById('submit-config').addEventListener('click', (event) => {
        pushConfig();
    })

    validateElements();
}
function pushConfig() {
    if (websocket.readyState == WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'config', ...values }))
    }
}

async function statusNotify(msg) {
    if (msg.reason == 'true') {
        statusElement.style.color = "green"
        statusElement.textContent = "Saved Successfully"
        await sleep(2000);
        statusElement.textContent = ""
    } else {
        statusElement.style.color = "red"
        statusElement.textContent = msg.reason
        await sleep(5000);
        statusElement.textContent = ""
    }
}


function connect() {
    websocket = new WebSocket(wsUri);
    const statusEl = document.getElementById('status');
    websocket.addEventListener('open', (event) => {
        console.log("Connected to WebSocket server");
        document.getElementById('status').textContent = "Connected";
    });
    websocket.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); }
        catch (err) {
            console.error("Bad WS message:", event.data, err);
            return;
        }

        if (msg.type == "config") {
            updateConfig(msg)
        } else if (msg.type == "status") {
            statusNotify(msg)
        }
    });
    websocket.addEventListener('close', (event) => {
        document.getElementById('status').textContent = "Disconnected";
        scheduleReconnect();
    });
    websocket.addEventListener('error', (event) => {
        console.log("Websocket error:", event);
    });
}
function scheduleReconnect() {
    setTimeout(() => {
        console.log(`reconnecting (delay ${reconnectDelay}ms)`);
        connect();
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }, reconnectDelay);
}
function validateElements() {
    for (const element of settingsElements) {
        if (!isNumeric(element.value)) {
            element.classList.add('invalid-input');
        } else {
            element.classList.remove('invalid-input');
        }
    }
}

initTimer();