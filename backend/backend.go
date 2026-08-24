package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const configPath = "config.json"

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Config struct {
	Bits      int    `json:"bits"`
	Subs      int    `json:"subs"`
	Donations int    `json:"donations"`
	SEToken   string `json:"streamElementsToken"`
}
type Message struct {
	Type      string `json:"type"`
	Bits      int    `json:"bits,omitempty"`
	Subs      int    `json:"subs,omitempty"`
	Donations int    `json:"donations,omitempty"`
	Remaining int    `json:"remaining,omitempty"`
	Seconds   int    `json:"seconds,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Paused    bool   `json:"paused,omitempty"`
	SEToken   string `json:"streamElementsToken,omitempty"`
}
type State struct {
	mu        sync.Mutex
	config    Config
	remaining int
	paused    bool

	settingsConn *websocket.Conn
	overlayConn  *websocket.Conn
}

func (s *State) sendTo(conn *websocket.Conn, msg Message) {
	if conn == nil {
		return
	}
	if err := conn.WriteJSON(msg); err != nil {
		conn.Close()
	}
}
func (s *State) overlayHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error: ", err)
		return
	}
	s.mu.Lock()
	s.overlayConn = conn
	s.mu.Unlock()

	defer func() {
		log.Println("Closing overlay websocket")
		s.mu.Lock()
		if s.overlayConn == conn {
			s.overlayConn = nil
		}
		s.mu.Unlock()
		conn.Close()
	}()
	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("Overlay Message read error", err)
			break
		}
	}
}
func (s *State) settingsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error: ", err)
		return
	}
	s.mu.Lock()
	s.settingsConn = conn
	cfg := s.config
	conn.WriteJSON(Message{Type: "config", Bits: cfg.Bits, Subs: cfg.Subs, Donations: cfg.Donations, SEToken: cfg.SEToken})
	s.mu.Unlock()

	defer func() {
		log.Println("Closing settingspage websocket")
		s.mu.Lock()
		if s.settingsConn == conn {
			s.settingsConn = nil
		}
		s.mu.Unlock()
		conn.Close()
	}()
	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("Message read error", err)
			break
		}
		switch msg.Type {
		case "config":
			s.mu.Lock()
			defer s.mu.Unlock()
			s.config = Config{Bits: msg.Bits, Subs: msg.Subs, Donations: msg.Donations, SEToken: msg.SEToken}
			var file *os.File = nil
			if file, err = os.OpenFile(configPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0664); err != nil {
				log.Println("Error opening config file: ", err)
				conn.WriteJSON((Message{Type: "status", Reason: "Error opening config file"}))
				break
			}
			defer file.Close()
			encoder := json.NewEncoder(file)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(s.config); err != nil {
				log.Println("Error writing config file: ", err)
				conn.WriteJSON((Message{Type: "status", Reason: "Error writing to config file"}))
				break
			}
			log.Printf("Config updated: %+v\n", s.config)
			conn.WriteJSON((Message{Type: "status", Reason: "true"}))

		case "add":
			s.addTime(msg.Seconds)

		case "pause":
			s.togglePause()
		case "overlay1":
			s.overlayConn.WriteJSON((Message{Type: "overlay1", Reason: msg.Reason, Remaining: s.remaining}))

		case "overlay2":
			s.overlayConn.WriteJSON((Message{Type: "overlay2", Remaining: s.remaining}))
		}
	}
}
func (s *State) togglePause() {
	s.mu.Lock()
	s.paused = !s.paused
	remaining := s.remaining
	s.mu.Unlock()

	msg := Message{Type: "updateTimer", Remaining: remaining}
	s.sendTo(s.overlayConn, msg)
	s.sendTo(s.settingsConn, msg)
	msg = Message{Type: "togglePause", Paused: s.paused}
	s.sendTo(s.settingsConn, msg)
	log.Println("timer pause status:", s.paused)
}
func (s *State) getConfig() {
	file, err := os.Open(configPath)
	if err != nil {
		log.Println("Error reading config file", err)
		return
	}
	defer file.Close()

	var config Config
	decoder := json.NewDecoder(file)
	if err = decoder.Decode(&config); err != nil {
		log.Println("Error decoding config file ", err)
	}
	s.config = config
}
func (s *State) runTimer() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		if s.remaining > 0 && !s.paused {
			s.remaining--
			remaining := s.remaining
			conn := s.overlayConn
			s.mu.Unlock()

			s.sendTo(conn, Message{Type: "updateTimer", Remaining: remaining})
			log.Println("time remaining: ", s.remaining)
		} else {
			s.mu.Unlock()
		}
	}
}
func (s *State) addTime(seconds int) {
	s.mu.Lock()
	s.remaining += seconds
	remaining := s.remaining
	conn := s.overlayConn
	s.mu.Unlock()
	s.sendTo(conn, Message{Type: "updateTimer", Remaining: remaining})
}
func main() {

	state := &State{}
	state.getConfig()
	state.paused = true
	http.HandleFunc("/ws/settings", state.settingsHandler)
	http.HandleFunc("/ws/timer", state.overlayHandler)

	go state.runTimer()
	log.Print("Starting server")
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}
