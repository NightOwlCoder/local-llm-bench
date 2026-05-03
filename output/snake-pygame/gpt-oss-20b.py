#!/usr/bin/env python3
"""
Snake Game – Pygame implementation

Author: ChatGPT
Date: 2026‑05‑02

How to play
------------
• Arrow keys or WASD to move the snake.
• Eat the red square (food) to grow and score points.
• Avoid the walls and your own tail.
• When the game is over, press R to restart or Q / ESC to quit.

Installation
------------
pip install pygame

Run
---
python snake_game.py
"""

import pygame
import sys
import random
from collections import deque

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
CELL_SIZE   = 20            # Size of one grid cell (px)
GRID_WIDTH  = 30            # Number of cells horizontally
GRID_HEIGHT = 20            # Number of cells vertically
SCREEN_W    = GRID_WIDTH * CELL_SIZE
SCREEN_H    = GRID_HEIGHT * CELL_SIZE
FPS         = 10            # Base speed – increases as snake grows

# Colors (RGB)
BG_COLOR      = (0, 0, 0)
SNAKE_COLOR   = (0, 255, 0)
FOOD_COLOR    = (255, 0, 0)
TEXT_COLOR    = (255, 255, 255)

# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------
def random_food_position(snake_body):
    """Return a random position not occupied by the snake."""
    while True:
        pos = (random.randint(0, GRID_WIDTH - 1),
               random.randint(0, GRID_HEIGHT - 1))
        if pos not in snake_body:
            return pos

def draw_rect(screen, color, grid_pos):
    """Draw a rectangle given a grid position."""
    rect = pygame.Rect(grid_pos[0]*CELL_SIZE, grid_pos[1]*CELL_SIZE,
                       CELL_SIZE, CELL_SIZE)
    pygame.draw.rect(screen, color, rect)

def draw_text(screen, text, pos, size=36):
    """Render and blit text."""
    font = pygame.font.SysFont(None, size)
    txt_surf = font.render(text, True, TEXT_COLOR)
    screen.blit(txt_surf, pos)

# ----------------------------------------------------------------------
# Main game class
# ----------------------------------------------------------------------
class SnakeGame:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        pygame.display.set_caption("Snake – Pygame Edition")
        self.clock = pygame.time.Clock()

        self.reset()

    def reset(self):
        """Reset the game to initial state."""
        self.snake = deque([(GRID_WIDTH // 2, GRID_HEIGHT // 2)])  # head in middle
        self.direction = (0, -1)          # start moving up
        self.pending_dir = self.direction
        self.food = random_food_position(self.snake)
        self.score = 0
        self.game_over = False
        self.speed = FPS

    def handle_input(self):
        """Handle keyboard events."""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()

            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    pygame.quit()
                    sys.exit()
                if not self.game_over:
                    # Arrow keys
                    if event.key == pygame.K_UP or event.key == pygame.K_w:
                        self.pending_dir = (0, -1)
                    elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                        self.pending_dir = (0, 1)
                    elif event.key == pygame.K_LEFT or event.key == pygame.K_a:
                        self.pending_dir = (-1, 0)
                    elif event.key == pygame.K_RIGHT or event.key == pygame.K_d:
                        self.pending_dir = (1, 0)
                else:
                    # Restart or quit after game over
                    if event.key == pygame.K_r:
                        self.reset()
                    if event.key == pygame.K_q:
                        pygame.quit()
                        sys.exit()

    def update(self):
        """Update game logic."""
        if self.game_over:
            return

        # Prevent 180° turns
        if (self.pending_dir[0] != -self.direction[0] or
            self.pending_dir[1] != -self.direction[1]):
            self.direction = self.pending_dir

        new_head = (self.snake[0][0] + self.direction[0],
                    self.snake[0][1] + self.direction[1])

        # Collision with walls
        if (new_head[0] < 0 or new_head[0] >= GRID_WIDTH or
            new_head[1] < 0 or new_head[1] >= GRID_HEIGHT):
            self.game_over = True
            return

        # Collision with self
        if new_head in self.snake:
            self.game_over = True
            return

        # Move snake
        self.snake.appendleft(new_head)

        # Food consumption
        if new_head == self.food:
            self.score += 1
            self.food = random_food_position(self.snake)
            # Increase speed slightly every 5 points
            if self.score % 5 == 0:
                self.speed += 1
        else:
            # Remove tail segment if no food eaten
            self.snake.pop()

    def render(self):
        """Draw everything on the screen."""
        self.screen.fill(BG_COLOR)

        # Draw food
        draw_rect(self.screen, FOOD_COLOR, self.food)

        # Draw snake
        for segment in self.snake:
            draw_rect(self.screen, SNAKE_COLOR, segment)

        # Draw score
        draw_text(self.screen, f"Score: {self.score}", (10, 10))

        if self.game_over:
            draw_text(self.screen, "GAME OVER", (SCREEN_W // 3, SCREEN_H // 3), size=48)
            draw_text(self.screen, "Press R to restart or Q to quit", (SCREEN_W // 6, SCREEN_H // 2), size=24)

        pygame.display.flip()

    def run(self):
        """Main game loop."""
        while True:
            self.clock.tick(self.speed)
            self.handle_input()
            self.update()
            self.render()

# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------
if __name__ == "__main__":
    game = SnakeGame()
    game.run()
