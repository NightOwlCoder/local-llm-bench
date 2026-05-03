import pygame
import time
import random

# Initialize Pygame
pygame.init()

# --- Constants ---
# Colors (R, G, B)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (213, 50, 80)
GREEN = (0, 255, 0)
BLUE = (50, 153, 213)

# Screen Dimensions
DIS_WIDTH = 600
DIS_HEIGHT = 400

# Snake and Food settings
BLOCK_SIZE = 20
SPEED = 15  # Controls the speed of the snake

# Setup the display
dis = pygame.display.set_mode((DIS_WIDTH, DIS_HEIGHT))
pygame.display.set_caption('Snake Game by Python')

# Clock controls how many frames per second the game runs
clock = pygame.time.Clock()

# --- Fonts ---
font_style = pygame.font.SysFont("bahnschrift", 25)
score_font = pygame.font.SysFont("comicsansms", 35)

def your_score(score):
    """Displays the current score on the screen"""
    value = score_font.render("Score: " + str(score), True, BLACK)
    dis.blit(value, [0, 0])

def our_snake(block_size, snake_list):
    """Draws the snake on the screen"""
    for x in snake_list:
        pygame.draw.rect(dis, GREEN, [x[0], x[1], block_size, block_size])

def message(msg, color):
    """Displays a message in the center of the screen"""
    mesg = font_style.render(msg, True, color)
    # Center the text
    text_rect = mesg.get_rect(center=(DIS_WIDTH/2, DIS_HEIGHT/2))
    dis.blit(mesg, text_rect)

def gameLoop():
    game_over = False
    game_close = False

    # Starting position
    x1 = DIS_WIDTH / 2
    y1 = DIS_HEIGHT / 2

    # Change in position (movement)
    x1_change = 0
    y1_change = 0

    # The snake is a list of segments
    snake_List = []
    Length_of_snake = 1

    # Place the first food
    foodx = round(random.randrange(0, DIS_WIDTH - BLOCK_SIZE) / 20.0) * 20.0
    foody = round(random.randrange(0, DIS_HEIGHT - BLOCK_SIZE) / 20.0) * 20.0

    while not game_over:

        while game_close == True:
            dis.fill(BLUE)
            message("You Lost! Press C-Play Again or Q-Quit", RED)
            your_score(Length_of_snake - 1)
            pygame.display.update()

            for event in pygame.event.get():
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_q:
                        game_over = True
                        game_close = False
                    if event.key == pygame.K_c:
                        gameLoop()

        # Event Handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game_over = True
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT:
                    x1_change = -BLOCK_SIZE
                    y1_change = 0
                elif event.key == pygame.K_RIGHT:
                    x1_change = BLOCK_SIZE
                    y1_change = 0
                elif event.key == pygame.K_UP:
                    y1_change = -BLOCK_SIZE
                    x1_change = 0
                elif event.key == pygame.K_DOWN:
                    y1_change = BLOCK_SIZE
                    x1_change = 0

        # Boundary Collision
        if x1 >= DIS_WIDTH or x1 < 0 or y1 >= DIS_HEIGHT or y1 < 0:
            game_close = True
        
        x1 += x1_change
        y1 += y1_change
        dis.fill(BLUE)
        
        # Draw Food
        pygame.draw.rect(dis, RED, [foodx, foody, BLOCK_SIZE, BLOCK_SIZE])
        
        # Snake Movement Logic
        snake_Head = []
        snake_Head.append(x1)
        snake_Head.append(y1)
        snake_List.append(snake_Head)
        
        # Remove the tail if we haven't eaten food
        if len(snake_List) > Length_of_snake:
            del snake_List[0]
        
        # Self Collision Detection
        for x in snake_List[:-1]:
            if x == snake_Head:
                game_close = True

        our_snake(BLOCK_SIZE, snake_List)
        your_score(Length_of_snake - 1)

        pygame.display.update()

        # Check if we ate the food
        if x1 == foodx and y1 == foody:
            foodx = round(random.randrange(0, DIS_WIDTH - BLOCK_SIZE) / 20.0) * 20.0
            foody = round(random.randrange(0, DIS_HEIGHT - BLOCK_SIZE) / 20.0) * 20.0
            Length_of_snake += 1

        clock.tick(SPEED)

    pygame.quit()
    quit()

# Start the game
gameLoop()
