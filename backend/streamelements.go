package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const APIUrl = "wss://astro.streamelements.com/"
const BitsThreshold = 100

type SEMessage struct {
	Type  string          `json:"type"`
	Topic string          `json:"topic,omitempty"`
	Error string          `json:"error,omitempty"`
	Data  json.RawMessage `json:"data,omitempty"`
}

type SubscribeRequest struct {
	Type  string `json:"type"`
	Nonce string `json:"nonce,omitempty"`
	Data  struct {
		Topic     string `json:"topic"`
		Token     string `json:"token,omitempty"`
		TokenType string `json:"token_type,omitempty"`
	} `json:"data"`
}

type TipEvent struct {
	CreatedAt time.Time `json:"createdAt"`
	IsMock    bool      `json:"isMock"`
	Data      struct {
		Amount float64 `json:"amount"`

		Username string `json:"username"`
	} `json:"data"`
}
type ActivityMessage struct {
	Type string `json:"type"` // 'cheer' 'subscriber' 'tip' 'communityGiftPurchase'

	Data struct {
		Username string `json:"username"`
		Amount   int    `json:"amount"` // bits for cheer, months for resub, amount for gifted
		Tier     string `json:"tier"`   // sub tier; 1000 for tier 1
	} `json:"data"`
}

func connectStreamElements(state *State) {
	delay := time.Second
	const maxDelay = 10 * time.Second
	const pollDelay = 2 * time.Second

	for {
		state.mu.Lock()
		token := state.config.SEToken
		state.mu.Unlock()

		if token == "" {
			time.Sleep(pollDelay)
			continue
		}

		if err := runStreamElements(state, token); err != nil {
			log.Println("StreamElements connection err:", err)
		}
		log.Printf("Reconnecting to StreamElements in %s\n", delay)
		time.Sleep(delay)
		delay *= 2
		if delay > maxDelay {
			delay = maxDelay
		}
	}
}

func runStreamElements(state *State, token string) error {
	conn, _, err := websocket.DefaultDialer.Dial(APIUrl, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	for _, topic := range []string{"channel.tips", "channel.activities"} {
		req := SubscribeRequest{Type: "subscribe", Nonce: "sub-" + topic}
		req.Data.Topic = topic
		req.Data.Token = token
		req.Data.TokenType = "jwt"
		if err := conn.WriteJSON(req); err != nil {
			return err
		}
	}
	for {
		var msg SEMessage
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("Error reading StreamElements Message:", err)
			return err
		}
		switch msg.Type {
		case "response":
			if msg.Error != "" {
				log.Println("StreamElements error:", msg.Error, string(msg.Data))
			} else {
				log.Println("Success:", string(msg.Data))
			}
		case "reconnect":
			log.Println("Streamelements requeste reconnect")
			return nil
		case "message":
			handleStreamElementsMessage(state, msg)
		case "welcome":
			log.Println("Welcome received:", string(msg.Data))
		}
	}
}

func handleStreamElementsMessage(state *State, msg SEMessage) {
	switch msg.Topic {
	case "channel.activities":
		var act ActivityMessage
		if err := json.Unmarshal(msg.Data, &act); err != nil {
			log.Println("Error parsing activity message:", err)
			return
		}

		switch act.Type {
		case "cheer":
			log.Printf("Cheer: %s (raw: %s)\n", act.Data.Username, string(msg.Data))
			if act.Data.Amount < BitsThreshold {
				break
			}
			var amount int
			amount = act.Data.Amount / 100 // 100 bits = 1 unit
			state.mu.Lock()
			perUnit := state.config.Bits
			state.mu.Unlock()
			seconds := amount * perUnit
			if seconds > 0 {
				state.addTime(seconds)
			}

		case "subscriber":
			log.Printf("Sub: %s (raw: %s)\n", act.Data.Username, string(msg.Data))
			state.mu.Lock()
			perUnit := state.config.Subs
			state.mu.Unlock()
			state.addTime(perUnit)

		case "tip":
			var tip TipEvent
			if err := json.Unmarshal(msg.Data, &tip); err != nil {
				log.Println("Error parsing tip message:", err)
				return
			}
			state.mu.Lock()
			perUnit := state.config.Donations
			state.mu.Unlock()
			seconds := int(tip.Data.Amount) * perUnit
			log.Printf("Tip: %s donated %.2f\n", tip.Data.Username, tip.Data.Amount)
			if seconds > 0 {
				state.addTime(seconds)
			}
		case "communityGiftPurchase":
			log.Printf("Gift Sub: %s (raw: %s)\n", act.Data.Username, string(msg.Data))
			amount := act.Data.Amount
			state.mu.Lock()
			perUnit := state.config.Subs
			state.mu.Unlock()
			state.addTime(perUnit * amount)
		default:
			log.Printf("? Raw: %s\n type: %s", string(msg.Data), string(act.Type))

		}
	}
}
