import pygame
import sys
import random

# --- Constants ---
SCREEN_WIDTH = 600
SCREEN_HEIGHT = 600
GRID_SIZE = 20  # Size of one tile
GRID_WIDTH = SCREEN_WIDTH // GRID_SIZE
GRID_HEIGHT = SCREEN_HEIGHT // GRID_SIZE

# Colors (R, G, B)
COLOR_BG = (30, 30, 30)       # Dark Gray Background
COLOR_GRID = (40, 40, 40)     # Slightly lighter for grid lines
COLOR_SNAKE = (0, 255, 100)   # Neon Green
COLOR_SNAKE_HEAD = (100, 255, 150)
COLOR_FOOD = (255, 50, 50)    # Red
COLOR_TEXT = (255, 255, 255)

# Game Settings
FPS = 15  # Lower FPS creates a retro feel
SPEED_DELAY = 1000 // FPS

class Snake:
    def __init__(self):
        self.reset()

    def reset(self):
        # Start in the middle
        self.length = 1
        self.positions = [((SCREEN_WIDTH // 2), (SCREEN_HEIGHT // 2))]
        self.direction = random.choice([UP, DOWN, LEFT, RIGHT])
        self.color = COLOR_SNAKE
        self.head_color = COLOR_SNAKE_HEAD
        self.score = 0

    def get_head_position(self):
        return self.positions[0]

    def turn(self, point):
        # Prevent snake from reversing into itself
        if self.length > 1 and (point[0] * -1, point[1] * -1) == self.direction:
            return
        else:
            self.direction = point

    def move(self):
        cur = self.get_head_position()
        x, y = self.direction
        new = ((cur[0] + (x * GRID_SIZE)), (cur[1] + (y * GRID_SIZE)))

        # Check wall collision
        if (new[0] < 0 or new[0] >= SCREEN_WIDTH or
            new[1] < 0 or new[1] >= SCREEN_HEIGHT):
            return False # Game over

        # Check self collision
        if len(self.positions) > 2 and new in self.positions[1:]:
            return False # Game over

        self.positions.insert(0, new)
        if len(self.positions) > self.length:
            self.positions.pop()

        return True # Move successful

    def draw(self, surface):
        for i, p in enumerate(self.positions):
            rect = (p[0], p[1], GRID_SIZE, GRID_SIZE)
            color = self.head_color if i == 0 else self.color
            pygame.draw.rect(surface, color, rect)
            pygame.draw.rect(surface, COLOR_BG, (rect[0]+1, rect[1]+1, GRID_SIZE-2, GRID_SIZE-2))

    def handle_keys(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_UP and self.direction != DOWN:
                    self.turn(UP)
                elif event.key == pygame.K_DOWN and self.direction != UP:
                    self.turn(DOWN)
                elif event.key == pygame.K_LEFT and self.direction != RIGHT:
                    self.turn(LEFT)
                elif event.key == pygame.K_RIGHT and self.direction != LEFT:
                    self.turn(RIGHT)

class Food:
    def __init__(self):
        self.position = (0, 0)
        self.color = COLOR_FOOD
        self.randomize_position()

    def randomize_position(self):
        self.position = (random.randint(0, GRID_WIDTH - 1) * GRID_SIZE,
                         random.randint(0, GRID_HEIGHT - 1) * GRID_SIZE)

    def draw(self, surface):
        rect = (self.position[0], self.position[1], GRID_SIZE, GRID_SIZE)
        pygame.draw.rect(surface, self.color, rect)
        pygame.draw.rect(surface, COLOR_BG, (rect[0]+1, rect[1]+1, GRID_SIZE-2, GRID_SIZE-2))

class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption('PySnake - Retro Edition')
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont('Consolas', 30)
        self.large_font = pygame.font.SysFont('Consolas', 60)
        
        self.high_score = 0
        self.reset_game()
        
        # States: 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
        self.state = 'MENU' 

    def reset_game(self):
        self.snake = Snake()
        self.food = Food()
        self.snake.score = 0
        self.game_over_timer = 0

    def draw_grid(self):
        for y in range(0, SCREEN_HEIGHT, GRID_SIZE):
            for x in range(0, SCREEN_WIDTH, GRID_SIZE):
                pygame.draw.rect(self.screen, COLOR_GRID, (x, y, GRID_SIZE, GRID_SIZE))

    def draw_text_centered(self, text, font, color, y_offset=0):
        surface = font.render(text, True, color)
        rect = surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + y_offset))
        self.screen.blit(surface, rect)

    def draw_score(self):
        score_text = f"Score: {self.snake.score}"
        high_score_text = f"High Score: {self.high_score}"
        
        # Draw in top left area
        self.screen.blit(self.font.render(score_text, True, COLOR_TEXT), (10, 10))
        self.screen.blit(self.font.render(high_score_text, True, COLOR_TEXT), (10, 40))

    def run(self):
        while True:
            # 1. Event Handling
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()

                if self.state == 'MENU':
                    if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                        self.state = 'PLAYING'

                elif self.state == 'PLAYING':
                    if event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_p: # Pause
                            self.state = 'PAUSED'
                        self.snake.handle_keys()

                elif self.state == 'PAUSED':
                    if event.type == pygame.KEYDOWN and event.key == pygame.K_p:
                        self.state = 'PLAYING'

                elif self.state == 'GAMEOVER':
                    if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                        self.state = 'MENU'

            # 2. Logic Update
            if self.state == 'PLAYING':
                # Move snake
                moved = self.snake.move()
                
                # Check for collisions
                if not moved:
                    if self.snake.score > self.high_score:
                        self.high_score = self.snake.score
                    self.state = 'GAMEOVER'
                
                # Check food collision
                if self.snake.get_head_position() == self.food.position:
                    self.snake.length += 1
                    self.snake.score += 10
                    self.food.randomize_position()
                    # Ensure food doesn't spawn on snake body
                    while self.food.position in self.snake.positions:
                        self.food.randomize_position()

            # 3. Drawing
            self.screen.fill(COLOR_BG)
            self.draw_grid()

            if self.state == 'MENU':
                self.draw_text_centered("SNAKE GAME", self.large_font, COLOR_SNAKE, -20)
                self.draw_text_centered("Press SPACE to Start", self.font, COLOR_TEXT, 40)

            elif self.state == 'PLAYING':
                self.snake.draw(self.screen)
                self.food.draw(self.screen)
                self.draw_score()

            elif self.state == 'PAUSED':
                self.snake.draw(self.screen)
                self.food.draw(self.screen)
                self.draw_text_centered("PAUSED", self.large_font, COLOR_TEXT, -20)
                self.draw_text_centered("Press 'P' to Resume", self.font, COLOR_TEXT, 40)

            elif self.state == 'GAMEOVER':
                self.snake.draw(self.screen)
                self.food.draw(self.screen)
                self.draw_score() # Show score on screen
                self.draw_text_centered("GAME OVER", self.large_font, COLOR_FOOD, -20)
                self.draw_text_centered(f"Score: {self.snake.score}", self.font, COLOR_TEXT, 30)
                self.draw_text_centered("Press SPACE for Menu", self.font, COLOR_TEXT, 60)

            pygame.display.update()
            self.clock.tick(FPS)

# Define Directions
UP = (0, -1)
DOWN = (0, 1)
LEFT = (-1, 0)
RIGHT = (1, 0)

if __name__ == "__main__":
    game = Game()
    game.run()
