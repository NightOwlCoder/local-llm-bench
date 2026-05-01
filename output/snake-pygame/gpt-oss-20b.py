#!/usr/bin/env python3
"""
Simple Snake game for Pygame
Author: ChatGPT (OpenAI)
"""

import pygame
import random
import sys

# ---------- CONFIGURATION ----------
GRID_SIZE = 20          # Size of each square (pixels)
GRID_WIDTH = 30         # Number of squares horizontally
GRID_HEIGHT = 20        # Number of squares vertically
WINDOW_WIDTH = GRID_SIZE * GRID_WIDTH
WINDOW_HEIGHT = GRID_SIZE * GRID_HEIGHT
FPS = 10                # Starting speed (frames per second)
SNAKE_COLOR = (0, 255, 0)
FOOD_COLOR = (255, 0, 0)
BG_COLOR = (0, 0, 0)
SCORE_COLOR = (255, 255, 255)
FONT_SIZE = 20
# -----------------------------------

pygame.init()
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("Snake (Pygame)")
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, FONT_SIZE)

def draw_rect(color, pos):
    """Draw a single square at the grid position `pos`."""
    rect = pygame.Rect(pos[0]*GRID_SIZE, pos[1]*GRID_SIZE, GRID_SIZE, GRID_SIZE)
    pygame.draw.rect(screen, color, rect)

def random_food_position(snake):
    """Return a random grid position that is not occupied by the snake."""
    while True:
        pos = (random.randint(0, GRID_WIDTH-1), random.randint(0, GRID_HEIGHT-1))
        if pos not in snake:
            return pos

def main():
    global FPS
    snake = [(GRID_WIDTH//2, GRID_HEIGHT//2)]  # List of (x, y) tuples
    direction = (1, 0)  # Moving right initially
    food = random_food_position(snake)
    score = 0
    paused = False

    running = True
    while running:
        # ---------- EVENT HANDLING ----------
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            # Arrow keys to change direction
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_p:
                    paused = not paused
                elif event.key == pygame.K_UP and direction != (0, 1):
                    direction = (0, -1)
                elif event.key == pygame.K_DOWN and direction != (0, -1):
                    direction = (0, 1)
                elif event.key == pygame.K_LEFT and direction != (1, 0):
                    direction = (-1, 0)
                elif event.key == pygame.K_RIGHT and direction != (-1, 0):
                    direction = (1, 0)
        # -------------------------------------

        if paused:
            clock.tick(15)
            continue

        clock.tick(FPS)

        # ---------- MOVE SNAKE ----------
        new_head = (snake[0][0] + direction[0], snake[0][1] + direction[1])

        # Collision with walls
        if (new_head[0] < 0 or new_head[0] >= GRID_WIDTH or
            new_head[1] < 0 or new_head[1] >= GRID_HEIGHT):
            print("Game over! You hit the wall.")
            running = False
            continue

        # Collision with itself
        if new_head in snake:
            print("Game over! You ran into yourself.")
            running = False
            continue

        snake.insert(0, new_head)  # Add new head

        # ---------- CHECK FOOD ----------
        if new_head == food:
            score += 1
            food = random_food_position(snake)
            # Increase speed slightly every 5 points
            if score % 5 == 0:
                FPS += 1
        else:
            snake.pop()  # Remove tail (normal move)
        # --------------------------------

        # ---------- DRAW ----------
        screen.fill(BG_COLOR)
        for segment in snake:
            draw_rect(SNAKE_COLOR, segment)
        draw_rect(FOOD_COLOR, food)

        # Score display
        score_surf = font.render(f"Score: {score}", True, SCORE_COLOR)
        screen.blit(score_surf, (10, 10))

        pygame.display.flip()
        # --------------------------------

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
