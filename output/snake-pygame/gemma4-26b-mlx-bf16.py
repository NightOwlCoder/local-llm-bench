import pygame
import time
import random

# Initialize Pygame
pygame.init()

# Define Colors
WHITE = (255, 255, 255)
YELLOW = (255, 255, 102)
BLACK = (0, 0, 0)
RED = (213, 50, 80)
GREEN = (0, 255, 0)
BLUE = (50, 153, 213)

# Screen Dimensions
WIDTH = 600
HEIGHT = 400

# Snake settings
BLOCK_SIZE = 20
SNAKE_SPEED = 15

# Initialize Display
dis = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('Snake Game by Python')

clock = pygame.time.Clock()

# Fonts
font_style = pygame.font.SysFont("bahnschrift", 25)
score_font = pygame.font.SysFont("comicsansms", 35)

def display_score(score):
    value = score_font.render("Your Score: " + str(score), True, YELLOW)
    dis.blit(value, [0, 0])

def draw_snake(block_size, snake_list):
    for x in snake_list:
        pygame.draw.rect(dis, GREEN, [x[0], x[1], block_size, block_size])

def message(msg, color):
    mesg = font_style.render(msg, True, color)
    # Center the text
    text_rect = mesg.get_rect(center=(WIDTH / 2, HEIGHT / 2))
    dis.blit(mesg, text_rect)

def gameLoop():
    game_over = False
    game_close = False

    # Starting Position
    x1 = WIDTH / 2
    y1 = HEIGHT / 2

    # Movement changes
    x1_change = 0
    y1_change = 0

    snake_List = []
    Length_of_snake = 1

    # Generate initial food position (aligned to grid)
    foodx = round(random.randrange(0, WIDTH - BLOCK_SIZE) / 20.0) * 20.0
    foody = round(random.randrange(0, HEIGHT - BLOCK_SIZE) / 20.0) * 20.0

    while not game_over:

        # Screen when player loses
        while game_close == True:
            dis.fill(BLUE)
            message("You Lost! Press C-Play Again or Q-Quit", RED)
            display_score(Length_of_snake - 1)
            pygame.display.update()

            for event in pygame.event.get():
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_q:
                        game_over = True
                        game_close = False
                    if event.key == pygame.K_c:
                        gameLoop()

        # Event Handling (Controls)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game_over = True
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT and x1_change == 0: # Prevent 180 turn
                    x1_change = -BLOCK_SIZE
                    y1_change = 0
                elif event.key == pygame.K_RIGHT and x1_change == 0:
                    x1_change = BLOCK_SIZE
                    y1_change = 0
                elif event.key == pygame.K_UP and y1_change == 0:
                    y1_change = -BLOCK_SIZE
                    x1_change = 0
                elif event.key == pygame.K_DOWN and y1_change == 0:
                    y1_change = BLOCK_SIZE
                    x1_change = 0

        # Check Boundary Collision
        if x1 >= WIDTH or x1 < 0 or y1 >= HEIGHT or y1 < 0:
            game_close = True
        
        x1 += x1_change
        y1 += y1_change
        dis.fill(BLACK)

        # Draw Food
        pygame.draw.rect(dis, RED, [foodx, foody, BLOCK_SIZE, BLOCK_SIZE])

        # Snake movement logic
        snake_Head = []
        snake_Head.append(x1)
        snake_Head.append(y1)
        snake_List.append(snake_Head)

        if len(snake_List) > Length_of_snake:
            del snake_List[0]

        # Check if snake hits itself
        for x in snake_List[:-1]:
            if x == snake_Head:
                game_close = True

        draw_snake(BLOCK_SIZE, snake_List)
        display_score(Length_of_snake - 1)

        pygame.display.update()

        # Check if food is eaten
        if x1 == foodx and y1 == foody:
            foodx = round(random.randrange(0, WIDTH - BLOCK_SIZE) / 20.0) * 20.0
            foody = round(random.randrange(0, HEIGHT - BLOCK_SIZE) / 20.0) * 20.0
            Length_of_snake += 1

        clock.tick(SNAKE_SPEED)

    pygame.quit()
    quit()

# Run the game
gameLoop()
