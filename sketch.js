// --- ML5.js Setup Variables ---
let video;
let bodyPose;
let connections;
let poses = [];
const skeletonColors = [
    [255, 0, 0],    // Red
    [0, 255, 255],  // Cyan
    [255, 255, 0],  // Yellow
    [0, 255, 0],    // Green
];
let vfactor = 1.5; // Scale factor for canvas size

// --- Game Variables ---
let balloon;
let BALLOON_RADIUS;
let HAND_HIT_RADIUS;

// --- Goal Zones ---
let GOAL_TOP, GOAL_BOTTOM, GOAL_HEIGHT;

let countdown = 0;        // Time remaining for the next round
let countdownStart = 3;   // 3 seconds
let countdownActive = false; // Is a countdown running?

let goalFlashActive = false;
let goalFlashTime = 1.0; // 1 second
let goalFlashTimer = 0;

// Scores
let leftScore = 0;
let rightScore = 0;
const POINTS_TO_WIN = 5; // configurable

let gameStarted = false;
let gameOver = false;
let gameOverSound;
let gameOverSoundPlayed = false;
let startSound;
let goalSound;
let goalSoundPlayed = false;
let handHitSound;
let edgeBounceSound;
let topBounceSound;

let cameraReady = false;

/**
 * Balloon Class: Handles movement, boundaries, and drawing.
 */
class Balloon {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.velX = 4 * (random() > 0.5 ? 1 : -1); // Start with random direction
        this.velY = 3 * (random() > 0.5 ? 1 : -1);
        this.color = [255, 255, 0]; // Yellow
        this.maxSpeed = 18;
        // this.hitSound = new AudioContext();
    }

    update() {
        if (gameOver) return;

        // --- Move the balloon ---
        this.x += this.velX;
        this.y += this.velY;

        // --- Bounce off top and bottom edges ---
        if (this.y - this.radius < 0 || this.y + this.radius > height) {
            this.velY *= -1;
            // Nudge back inside
            this.y = constrain(this.y, this.radius, height - this.radius);
            if (topBounceSound.isLoaded()) topBounceSound.play();
        }

        // --- Left edge ---
        if (!gameOver && !countdownActive && !goalFlashActive) {
            if (this.x - this.radius < 0) {
                if (this.y > GOAL_TOP && this.y < GOAL_BOTTOM) {
                    // Ball went through the goal → RIGHT player scores
                    rightScore++;
                    if (!goalSoundPlayed && goalSound.isLoaded()) {
                        goalSound.play();
                        goalSoundPlayed = true; // only once per goal
                    }
                    checkGameOver();
                    if (!gameOver) {
                        resetBall(this);
                        startNewRound(true);
                    }
                } else {
                    // Bounce if outside goal
                    this.velX *= -1;
                    this.x = this.radius; // nudge back inside
                    if (edgeBounceSound.isLoaded()) edgeBounceSound.play();
                }
            }
        }

        // --- Right edge ---
        if (!gameOver && !countdownActive && !goalFlashActive) {
            if (this.x + this.radius > width) {
                if (this.y > GOAL_TOP && this.y < GOAL_BOTTOM) {
                    // Ball went through the goal → LEFT player scores
                    leftScore++;
                    if (!goalSoundPlayed && goalSound.isLoaded()) {
                        goalSound.play();
                        goalSoundPlayed = true; // only once per goal
                    }
                    checkGameOver();

                    if (!gameOver) {
                        resetBall(this);
                        startNewRound(true);
                    }
                } else {
                    // Bounce if outside goal
                    this.velX *= -1;
                    this.x = width - this.radius; // nudge back inside
                    if (edgeBounceSound.isLoaded()) edgeBounceSound.play();
                }
            }
        }
    }

    draw() {
        fill(this.color[0], this.color[1], this.color[2]);
        noStroke();
        circle(this.x, this.y, this.radius * 2);
    }

    checkCollision(keypoint) {
        // Check confidence and skip if keypoint is not detected reliably
        if (!keypoint || keypoint.confidence < 0.2) return false;

        let d = dist(this.x, this.y, keypoint.x, keypoint.y);

        if (d < this.radius + HAND_HIT_RADIUS) {
            // COLLISION DETECTED
            let angle = atan2(this.y - keypoint.y, this.x - keypoint.x);
            let currentSpeed = sqrt(this.velX * this.velX + this.velY * this.velY);

            // 1. Velocity Change: Reflect and add a slight boost (1.2x) to the speed for a "push"
            this.velX = cos(angle) * currentSpeed * 1.2;
            this.velY = sin(angle) * currentSpeed * 1.2;

            // 2. Cap Speed
            let newSpeed = sqrt(this.velX * this.velX + this.velY * this.velY);
            if (newSpeed > this.maxSpeed) {
                this.velX = (this.velX / newSpeed) * this.maxSpeed;
                this.velY = (this.velY / newSpeed) * this.maxSpeed;
            }

            // 3. Position Nudge: Push balloon out of the arm's collision zone to prevent stuck bounces
            let overlap = (this.radius + HAND_HIT_RADIUS) - d;
            this.x += cos(angle) * overlap * 1.5;
            this.y += sin(angle) * overlap * 1.5;

            // this.playSound(880); // Play a higher pitch sound for a hand hit
            if (handHitSound.isLoaded()) {
                handHitSound.play();
            }

            return true;
        }
        return false;
    }

    // // Simple sound generation using Tone.js-like principles via AudioContext
    // playSound(frequency) {
    //     try {
    //         const context = this.hitSound;
    //         const oscillator = context.createOscillator();
    //         const gainNode = context.createGain();

    //         oscillator.type = 'sine';
    //         oscillator.frequency.setValueAtTime(frequency, context.currentTime);

    //         gainNode.gain.setValueAtTime(0.5, context.currentTime);
    //         gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);

    //         oscillator.connect(gainNode);
    //         gainNode.connect(context.destination);
    //         oscillator.start();
    //         oscillator.stop(context.currentTime + 0.1);
    //     } catch (e) {
    //         console.error("Audio failed:", e);
    //         // Can safely ignore audio errors in unsupported environments
    //     }
    // }
}

// --- ML5.js Required Functions ---

function preload() {
    bodyPose = ml5.bodyPose("MoveNet", { flipped: true });

    gameOverSound = loadSound('sounds/dondon.mp3');
    startSound = loadSound('sounds/button17.mp3');
    goalSound = loadSound('sounds/goal.mp3');
    handHitSound = loadSound('sounds/hit.mp3');
    edgeBounceSound = loadSound('sounds/edge.mp3');
    topBounceSound = loadSound('sounds/top.mp3');
}

function gotPoses(results) {
    poses = results;
}

function setup() {
    // Set up the canvas dimensions using the factor
    // const canvasWidth = 640 * vfactor;
    // const canvasHeight = 480 * vfactor;
    createCanvas(windowWidth, windowHeight);

    // Scale constants dynamically
    BALLOON_RADIUS = width * 0.025;
    HAND_HIT_RADIUS = width * 0.03;

    GOAL_TOP = height * 0.25;
    GOAL_BOTTOM = height * 0.75;
    GOAL_HEIGHT = GOAL_BOTTOM - GOAL_TOP;

    // Initialize video capture
    video = createCapture(VIDEO, { flipped: true }, () => {
        // This callback runs once the camera is ready
        cameraReady = true;
    });

    video.size(windowWidth, windowHeight);
    video.hide();

    // Start pose detection
    bodyPose.detectStart(video, gotPoses);

    // Retrieve skeleton connections
    connections = bodyPose.getSkeleton();

    // Initialize the balloon in the center of the canvas
    balloon = new Balloon(width / 2, height / 2, BALLOON_RADIUS);

    // Log setup successful
    console.log("Game setup complete. Ready to detect poses.");
}

function draw() {
    // 1. Draw the video feed (mirrored due to flipped: true)
    image(video, 0, 0, width, height);

    if (!gameStarted && cameraReady) {
        push();

        // Show Start button
        fill(0, 0, 200);
        rectMode(CENTER);
        let buttonX = width / 2;
        let buttonY = height / 2;
        let buttonWidth = 200;
        let buttonHeight = 80;
        rect(buttonX, buttonY, buttonWidth, buttonHeight, 10);

        fill(255);
        textSize(40);
        textAlign(CENTER, CENTER);
        text("START", buttonX, buttonY);
        pop();

        return; // stop the rest of draw() until started
    }

    // 2. Process and draw detected poses
    if (poses.length > 0) {
        for (let i = 0; i < poses.length; i++) {
            let pose = poses[i]; // We primarily use the first detected person for the game

            // A. Collision Check against Wrists
            // Find left and right wrist keypoints by name
            const leftWrist = pose.keypoints.find(k => k.name === 'left_wrist');
            const rightWrist = pose.keypoints.find(k => k.name === 'right_wrist');

            if (!goalFlashActive && !countdownActive) {
                if (leftWrist) {
                    balloon.checkCollision(leftWrist);
                }
                if (rightWrist) {
                    balloon.checkCollision(rightWrist);
                }
            }

            // B. Draw Skeleton and Keypoints
            let colorIndex = i; // Always use the first color for the main player
            let currentColor = skeletonColors[colorIndex];
            stroke(currentColor[0], currentColor[1], currentColor[2]);
            strokeWeight(8);

            const FACE_POINTS = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear'];

            // Draw connections (skeleton lines)
            for (let j = 0; j < connections.length; j++) {
                let connection = connections[j];
                let a = connection[0];
                let b = connection[1];
                let keyPointA = pose.keypoints[a];
                let keyPointB = pose.keypoints[b];
                let confA = keyPointA.confidence;
                let confB = keyPointB.confidence;

                // Skip any connection involving a face point
                if (FACE_POINTS.includes(keyPointA.name) || FACE_POINTS.includes(keyPointB.name)) {
                    continue;
                }

                if (confA > 0.05 && confB > 0.05) {
                    line(keyPointA.x, keyPointA.y, keyPointB.x, keyPointB.y);
                }
            }

            // Draw keypoints (circles)
            for (let j = 0; j < pose.keypoints.length; j++) {
                let keypoint = pose.keypoints[j];
                fill(255);
                noStroke();

                // Skip face points entirely
                if (FACE_POINTS.includes(keypoint.name)) continue;
                
                if (keypoint.confidence > 0.05) {
                    // Highlight the wrists to show the collision point
                    if (keypoint.name === 'left_wrist' || keypoint.name === 'right_wrist') {
                        fill(255, 100, 100); // Red highlight
                        circle(keypoint.x, keypoint.y, HAND_HIT_RADIUS * 2); // Show the collision radius
                    } else {
                        fill(255);
                        circle(keypoint.x, keypoint.y, 8);
                    }
                }
            }
        }

        // --- Court Separator ---
        // Draw a vertical dashed line in the center
        stroke(0);           // black
        strokeWeight(4);     // line thickness
        let dashLength = 20; // length of each dash
        let gapLength = 15;  // gap between dashes

        for (let y = 0; y < height; y += dashLength + gapLength) {
            line(width / 2, y, width / 2, y + dashLength);
        }

        // --- Score Display ---
        textSize(64);
        textAlign(CENTER, TOP);
        stroke(0);
        strokeWeight(6);
        fill(255);
        text(leftScore, width / 4, 20);
        text(rightScore, 3 * width / 4, 20);

        // --- Draw Goal Zones ---
        noFill();
        stroke(0, 255, 0); // bright green
        strokeWeight(6);

        // Left goal
        rect(0, GOAL_TOP, 20, GOAL_HEIGHT);

        // Right goal
        rect(width - 20, GOAL_TOP, 20, GOAL_HEIGHT);

        // Check for Game Over
        if (!gameOver) {
            if (!goalFlashActive && !countdownActive) {
                balloon.update();
                balloon.draw();
            }

            // Check if someone reached POINTS_TO_WIN
            if (leftScore >= POINTS_TO_WIN || rightScore >= POINTS_TO_WIN) {
                gameOver = true;
            }
        } else {
            // --- Play game over sound once ---
            if (!gameOverSound.isPlaying() && !gameOverSoundPlayed) {
                gameOverSound.play();
                gameOverSoundPlayed = true; // flag so it doesn't replay every frame
            }

            // --- Display Game Over Message ---
            push(); // <--- save drawing state

            let winnerLeft = leftScore >= POINTS_TO_WIN;

            // Draw loser half grey overlay as before
            push();
            noStroke();
            fill(0, 0, 0, 100);
            rect(winnerLeft ? width / 2 : 0, 0, width / 2, height);
            pop();

            // Spawn confetti once when gameOver triggers
            if (confettiParticles.length === 0) {
                spawnConfetti(winnerLeft);
            }

            // Draw confetti
            drawConfetti();

            fill(0, 200, 0);
            textSize(48);
            textAlign(CENTER, CENTER);
            let winner = leftScore >= POINTS_TO_WIN ? "Left Player" : "Right Player";
            text(`${winner} Wins!`, width / 2, height / 2 - 40);

            // Replay button
            fill(0, 0, 200);
            rectMode(CENTER);
            let buttonX = width / 2;
            let buttonY = height / 2 + 40;
            let buttonWidth = 160;
            let buttonHeight = 60;
            rect(buttonX, buttonY, buttonWidth, buttonHeight, 10);

            fill(255);
            textSize(32);
            text("Replay?", buttonX, buttonY);

            pop(); // <--- restore previous state
        }
    }

    if (goalFlashActive && !gameOver) {
        // Show "GOAL!" message
        fill(255, 215, 0); // gold color
        stroke(0);
        strokeWeight(8);
        textSize(96);
        textAlign(CENTER, CENTER);
        text("GOAL!", width / 2, height / 2);

        // Decrease timer
        goalFlashTimer -= deltaTime / 1000;

        if (goalFlashTimer <= 0) {
            goalFlashActive = false;
            countdown = countdownStart; // start 3-2-1 countdown
            countdownActive = true;
        }
    } else if (countdownActive) {
        // Show countdown
        fill(255, 0, 0);
        stroke(0);
        strokeWeight(8);
        textSize(128);
        textAlign(CENTER, CENTER);
        text(Math.ceil(countdown), width / 2, height / 2);

        countdown -= deltaTime / 1000;

        if (countdown <= 0) {
            countdownActive = false;
            // Launch the ball in random direction
            balloon.velX = 4 * (random() > 0.5 ? 1 : -1);
            balloon.velY = 3 * (random() > 0.5 ? 1 : -1);
        }
    }
}

function mousePressed() {
    // Start button
    if (!gameStarted) {
        let buttonX = width / 2;
        let buttonY = height / 2;
        let buttonWidth = 200;
        let buttonHeight = 80;

        if (
            mouseX > buttonX - buttonWidth / 2 &&
            mouseX < buttonX + buttonWidth / 2 &&
            mouseY > buttonY - buttonHeight / 2 &&
            mouseY < buttonY + buttonHeight / 2
        ) {
            // play start sound
            if (startSound.isLoaded()) startSound.play();

            gameStarted = true;
            resetBall(balloon);
            startNewRound(false); // start first round with countdown, no GOAL! flash
            return;
        }
    }

    if (gameOver) {
        // Check if click is inside the replay button
        let buttonX = width / 2;
        let buttonY = height / 2 + 40;
        let buttonWidth = 160;
        let buttonHeight = 60;

        if (
            mouseX > buttonX - buttonWidth / 2 &&
            mouseX < buttonX + buttonWidth / 2 &&
            mouseY > buttonY - buttonHeight / 2 &&
            mouseY < buttonY + buttonHeight / 2
        ) {
            // play start sound
            if (startSound.isLoaded()) startSound.play();

            // --- Reset game state ---
            leftScore = 0;
            rightScore = 0;
            gameOver = false;

            // --- Reset goal flash ---
            goalFlashActive = false;
            goalFlashTimer = 0;

            // --- Reset countdown if needed ---
            countdownActive = false;
            countdown = 3; // or whatever your starting count is

            // reset game over sound flag and confetti
            gameOverSoundPlayed = false;
            confettiParticles = [];

            // --- Reset ball ---
            resetBall(balloon);

            // Start new round countdown
            startNewRound(false);
        }
    }
}

function checkGameOver() {
    if (leftScore >= POINTS_TO_WIN || rightScore >= POINTS_TO_WIN) {
        gameOver = true;
    }
}

function resetBall(balloon) {
    balloon.x = width / 2;
    balloon.y = height / 2;
    balloon.velX = 0;
    balloon.velY = 0;
}

function startNewRound(isGoal = true) {
    goalSoundPlayed = false;
    if (isGoal) {
        goalFlashActive = true;
        goalFlashTimer = goalFlashTime;
    } else {
        goalFlashActive = false; // no GOAL! flash
    }

    countdown = countdownStart;
    countdownActive = true;
}

// --- Confetti Setup ---
let confettiParticles = [];
const CONFETTI_COUNT = 100;

// Call this when someone wins
function spawnConfetti(winnerLeft) {
    confettiParticles = [];
    let xMin = winnerLeft ? 0 : width / 2;
    let xMax = winnerLeft ? width / 2 : width;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
        confettiParticles.push({
            x: random(xMin, xMax),
            y: random(-50, -10),
            size: random(5, 12),
            color: [random(255), random(255), random(255)],
            velY: random(2, 6),
            velX: random(-2, 2),
            angle: random(TWO_PI),
            spin: random(-0.1, 0.1)
        });
    }
}

// Call this in draw()
function drawConfetti() {
    for (let p of confettiParticles) {
        push();
        translate(p.x, p.y);
        rotate(p.angle);
        fill(p.color[0], p.color[1], p.color[2]);
        noStroke();
        rect(0, 0, p.size, p.size / 2); // small rectangle
        pop();

        // Update position
        p.x += p.velX;
        p.y += p.velY;
        p.angle += p.spin;

        // Optional: wrap around top
        if (p.y > height) {
            p.y = random(-50, -10);
        }
    }
}