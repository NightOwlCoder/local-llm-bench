import pygame
import sys
import random
import math

# Initialize pygame
pygame.init()

# Screen dimensions
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Snake Game")

# Colors
BACKGROUND = (15, 20, 25)
SNAKE_HEAD = (50, 205, 50)
SNAKE_BODY = (34, 139, 34)
FOOD_COLOR = (220, 20, 60)
TEXT_COLOR = (220, 220, 220)
GRID_COLOR = (30, 30, 40)

# Game variables
CELL_SIZE = 20
CELL_NUMBER_X = WIDTH // CELL_SIZE
CELL_NUMBER_Y = HEIGHT // CELL_SIZE
FPS = 10

# Font
font = pygame.font.SysFont(None, 36)

class Snake:
    def __init__(self):
        self.body = [(5, 10), (4, 10), (3, 10)]
        self.direction = (1, 0)  # Moving right
        self.new_block = False

    def draw_snake(self):
        for index, block in enumerate(self.body):
            x_pos = block[0] * CELL_SIZE
            y_pos = block[1] * CELL_SIZE
            block_rect = pygame.Rect(x_pos, y_pos, CELL_SIZE, CELL_SIZE)
            
            if index == 0:  # Head
                pygame.draw.rect(screen, SNAKE_HEAD, block_rect)
                # Draw eyes
                eye_size = CELL_SIZE // 5
                # Determine eye positions based on direction
                if self.direction == (1, 0):  # Right
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + CELL_SIZE - 5, y_pos + 5), eye_size)
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + CELL_SIZE - 5, y_pos + CELL_SIZE - 5), eye_size)
                elif self.direction == (-1, 0):  # Left
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + 5, y_pos + 5), eye_size)
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + 5, y_pos + CELL_SIZE - 5), eye_size)
                elif self.direction == (0, 1):  # Down
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + 5, y_pos + CELL_SIZE - 5), eye_size)
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + CELL_SIZE - 5, y_pos + CELL_SIZE - 5), eye_size)
                elif self.direction == (0, -1):  # Up
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + 5, y_pos + 5), eye_size)
                    pygame.draw.circle(screen, (0, 0, 0), (x_pos + CELL_SIZE - 5, y_pos + 5), eye_size)
            else:  # Body
                pygame.draw.rect(screen, SNAKE_BODY, block_rect)
                pygame.draw.rect(screen, (20, 80, 20), block_rect, 1)  # Border

    def move_snake(self):
        body_copy = self.body[:-1]
        body_copy.insert(0, (body_copy[0][0] + self.direction[0], body_copy[0][1] + self.direction[1]))
        
        if self.new_block:
            body_copy.append(self.body[-1])
            self.new_block = False
            
        self.body = body_copy

    def add_block(self):
        self.new_block = True

    def check_collision(self):
        # Check self collision
        for block in self.body[1:]:
            if block == self.body[0]:
                return True
        return False

    def check_boundary(self):
        head = self.body[0]
        if head[0] >= CELL_NUMBER_X or head[0] < 0 or head[1] >= CELL_NUMBER_Y or head[1] < 0:
            return True
        return False

class Food:
    def __init__(self):
        self.randomize()

    def draw_food(self):
        food_rect = pygame.Rect(self.pos[0] * CELL_SIZE, self.pos[1] * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        pygame.draw.rect(screen, FOOD_COLOR, food_rect)
        # Draw a shine effect
        shine_rect = pygame.Rect(self.pos[0] * CELL_SIZE + 4, self.pos[1] * CELL_SIZE + 4, CELL_SIZE//4, CELL_SIZE//4)
        pygame.draw.ellipse(screen, (255, 200, 200), shine_rect)

    def randomize(self):
        self.x = random.randint(0, CELL_NUMBER_X - 1)
        self.y = random.randint(0, CELL_NUMBER_Y - 1)
        self.pos = (self.x, self.y)

class Game:
    def __init__(self):
        self.snake = Snake()
        self.food = Food()
        self.score = 0
        self.game_active = True

    def update(self):
        if self.game_active:
            self.snake.move_snake()
            self.check_collision()
            self.check_fail()

    def draw_elements(self):
        screen.fill(BACKGROUND)
        
        # Draw grid
        for x in range(0, WIDTH, CELL_SIZE):
            pygame.draw.line(screen, GRID_COLOR, (x, 0), (x, HEIGHT))
        for y in range(0, HEIGHT, CELL_SIZE):
            pygame.draw.line(screen, GRID_COLOR, (0, y), (WIDTH, y))
            
        self.food.draw_food()
        self.snake.draw_snake()
        
        # Draw score
        score_text = f"Score: {self.score}"
        score_surface = font.render(score_text, True, TEXT_COLOR)
        screen.blit(score_surface, (10, 10))

    def check_collision(self):
        if self.snake.body[0] == self.food.pos:
            self.food.randomize()
            self.snake.add_block()
            self.score += 1
            
            # Make sure food doesn't appear on snake
            for block in self.snake.body:
                if block == self.food.pos:
                    self.food.randomize()

    def check_fail(self):
        if self.snake.check_boundary() or self.snake.check_collision():
            self.game_active = False

    def restart_game(self):
        self.snake = Snake()
        self.food = Food()
        self.score = 0
        self.game_active = True

def main():
    game = Game()
    clock = pygame.time.Clock()
    
    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_UP and game.snake.direction != (0, 1):
                    game.snake.direction = (0, -1)
                if event.key == pygame.K_DOWN and game.snake.direction != (0, -1):
                    game.snake.direction = (0, 1)
                if event.key == pygame.K_LEFT and game.snake.direction != (1, 0):
                    game.snake.direction = (-1, 0)
                if event.key == pygame.K_RIGHT and game.snake.direction != (-1, 0):
                    game.snake.direction = (1, 0)
                if event.key == pygame.K_SPACE and not game.game_active:
                    game.restart_game()
        
        game.update()
        game.draw_elements()
        
        # Game over screen
        if not game.game_active:
            game_over_text = font.render("Game Over! Press SPACE to restart", True, TEXT_COLOR)
            text_rect = game_over_text.get_rect(center=(WIDTH//2, HEIGHT//2))
            screen.blit(game_over_text, text_rect)
        
        pygame.display.update()
        clock.tick(FPS)

if __name__ == "__main__":
    main()
