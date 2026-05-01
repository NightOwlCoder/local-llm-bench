import pygame
import random

# Initialize Pygame
pygame.init()

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 200, 0)
RED   = (200, 0, 0)

# Screen & Grid Settings
WIDTH, HEIGHT = 600, 400
CELL_SIZE = 20
GRID_W = WIDTH // CELL_SIZE
GRID_H = HEIGHT // CELL_SIZE

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Snake Game")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 36)

def spawn_food(snake):
    """Spawn food at a random position not occupied by the snake."""
    while True:
        pos = [random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)]
        if pos not in snake:
            return pos

def reset_game():
    """Initialize game state."""
    snake = [[GRID_W // 2, GRID_H // 2]]
    direction = "RIGHT"
    next_direction = "RIGHT"
    score = 0
    food = spawn_food(snake)
    return snake, direction, next_direction, food, score

def main():
    snake, direction, next_direction, food, score = reset_game()
    running = True
    game_over = False

    while running:
        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if game_over and event.key == pygame.K_r:
                    snake, direction, next_direction, food, score = reset_game()
                    game_over = False
                elif not game_over:
                    if event.key == pygame.K_UP    and direction != "DOWN":   next_direction = "UP"
                    elif event.key == pygame.K_DOWN and direction != "UP":     next_direction = "DOWN"
                    elif event.key == pygame.K_LEFT and direction != "RIGHT":  next_direction = "LEFT"
                    elif event.key == pygame.K_RIGHT and direction != "LEFT":  next_direction = "RIGHT"

        if not game_over:
            # Update direction & move snake
            direction = next_direction
            head = snake[0].copy()

            if direction == "UP":    head[1] -= 1
            elif direction == "DOWN":head[1] += 1
            elif direction == "LEFT":head[0] -= 1
            elif direction == "RIGHT":head[0] += 1

            # Collision detection (walls or self)
            if (head[0] < 0 or head[0] >= GRID_W or
                head[1] < 0 or head[1] >= GRID_H or
                head in snake):
                game_over = True
            else:
                snake.insert(0, head)
                if head == food:
                    score += 1
                    food = spawn_food(snake)
                else:
                    snake.pop()  # Remove tail if not eating

        # Drawing
        screen.fill(BLACK)

        # Draw snake
        for segment in snake:
            pygame.draw.rect(screen, GREEN,
                             (segment[0]*CELL_SIZE, segment[1]*CELL_SIZE, CELL_SIZE-1, CELL_SIZE-1))

        # Draw food
        pygame.draw.rect(screen, RED,
                         (food[0]*CELL_SIZE, food[1]*CELL_SIZE, CELL_SIZE-1, CELL_SIZE-1))

        # Draw score
        score_text = font.render(f"Score: {score}", True, WHITE)
        screen.blit(score_text, (10, 10))

        # Game over message
        if game_over:
            go_text = font.render("GAME OVER - Press R to Restart", True, WHITE)
            rect = go_text.get_rect(center=(WIDTH//2, HEIGHT//2))
            screen.blit(go_text, rect)

        pygame.display.flip()
        clock.tick(10)  # Game speed (frames per second)

    pygame.quit()

if __name__ == "__main__":
    main()