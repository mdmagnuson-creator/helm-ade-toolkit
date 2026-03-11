package models

import "time"

// User represents a user in the system
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Never expose in JSON
	Name         string    `json:"name"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// UserPublic returns a public-safe representation of the user
func (u *User) UserPublic() map[string]interface{} {
	return map[string]interface{}{
		"id":        u.ID,
		"email":     u.Email,
		"name":      u.Name,
		"createdAt": u.CreatedAt,
	}
}
