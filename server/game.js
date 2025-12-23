class Game {
    constructor() {
        this.players = {}; 
        this.foods = [];
        this.arenaSize = 200;
        this.foodCount = 100;
        this.baseSpeed = 30;
        this.turnSpeed = 5.0;
        this.bodySpacing = 1.5;
        
        for (let i = 0; i < this.foodCount; i++) {
            this.foods.push(this.createFood());
        }
        
        this.lastUpdateTime = Date.now();
    }

    createFood() {
        return {
            id: Math.random().toString(36).substr(2, 9),
            x: (Math.random() - 0.5) * this.arenaSize,
            z: (Math.random() - 0.5) * this.arenaSize,
            color: Math.floor(Math.random() * 0xffffff)
        };
    }

    addPlayer(id) {
        this.players[id] = {
            id: id,
            connected: true,
            alive: false,
            score: 0,
            name: "Snake",
            color: Math.random() * 0xffffff,
            body: [], 
            angle: 0,
            targetAngle: 0
        };
        return this.players[id];
    }
    
    spawnPlayer(id, name) {
        if (!this.players[id]) return;
        
        const player = this.players[id];
        player.alive = true;
        player.name = name || "Snake";
        player.score = 0;
        player.angle = Math.random() * Math.PI * 2;
        player.targetAngle = player.angle;
        
        const startX = (Math.random() - 0.5) * (this.arenaSize / 2);
        const startZ = (Math.random() - 0.5) * (this.arenaSize / 2);
        
        player.body = [];
        for(let i=0; i<8; i++) {
            player.body.push({ x: startX, z: startZ });
        }
    }

    removePlayer(id) {
        delete this.players[id];
    }

    processInput(id, data) {
        const player = this.players[id];
        if (player && player.alive) {
            player.targetAngle = data.angle;
        }
    }

    update() {
        const now = Date.now();
        const dt = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        const deadPlayers = [];

        for (const id in this.players) {
            const p = this.players[id];
            if (!p.alive) continue;

            let diff = p.targetAngle - p.angle;
            while (diff <= -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            
            const maxTurn = this.turnSpeed * dt;
            if (Math.abs(diff) > maxTurn) {
                p.angle += Math.sign(diff) * maxTurn;
            } else {
                p.angle = p.targetAngle;
            }

            const speed = this.baseSpeed;
            const dx = Math.sin(p.angle) * speed * dt;
            const dz = Math.cos(p.angle) * speed * dt;
            
            const head = p.body[0];
            const newHeadX = head.x + dx;
            const newHeadZ = head.z + dz;

            const limit = this.arenaSize / 2;
            if (newHeadX < -limit || newHeadX > limit || newHeadZ < -limit || newHeadZ > limit) {
                deadPlayers.push(id);
                continue;
            }

            p.body[0].x = newHeadX;
            p.body[0].z = newHeadZ;
            
            for (let i = 1; i < p.body.length; i++) {
                const curr = p.body[i];
                const prev = p.body[i-1];
                const dx = prev.x - curr.x;
                const dz = prev.z - curr.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist > this.bodySpacing) {
                    const ratio = (dist - this.bodySpacing) / dist;
                    curr.x += dx * ratio;
                    curr.z += dz * ratio;
                }
            }
        }

        for (const id in this.players) {
            const p = this.players[id];
            if (!p.alive) continue;
            if (deadPlayers.includes(id)) continue;

            const head = p.body[0];
            const headRadius = 1.0;

            for (let i = this.foods.length - 1; i >= 0; i--) {
                const f = this.foods[i];
                const dx = head.x - f.x;
                const dz = head.z - f.z;
                if (dx*dx + dz*dz < (headRadius + 0.8)**2) {
                    this.foods.splice(i, 1);
                    this.foods.push(this.createFood());
                    p.score++;
                    const tail = p.body[p.body.length-1];
                    p.body.push({x: tail.x, z: tail.z});
                }
            }

            for (const otherId in this.players) {
                const other = this.players[otherId];
                if (!other.alive) continue;
                const startSeg = (id === otherId) ? 2 : 0; 
                for (let i = startSeg; i < other.body.length; i++) {
                    const seg = other.body[i];
                    const distSq = (head.x - seg.x)**2 + (head.z - seg.z)**2;
                    if (distSq < (headRadius + 0.8)**2) {
                        deadPlayers.push(id);
                        break;
                    }
                }
                if (deadPlayers.includes(id)) break;
            }
        }
        
        deadPlayers.forEach(id => {
            const p = this.players[id];
            if (p && p.alive) {
                p.alive = false;
                for(let i=0; i<p.body.length; i+=2) {
                    const seg = p.body[i];
                    this.foods.push({
                        id: `remains_${id}_${i}`,
                        x: seg.x,
                        z: seg.z,
                        color: p.color
                    });
                }
            }
        });

        const pack = {
            players: [],
            foods: this.foods
        };
        for(const id in this.players) {
            const p = this.players[id];
            if(p.alive) {
                pack.players.push({
                    id: p.id,
                    // OPTIMIZATION: Send minimal data
                    x: p.body[0].x,
                    z: p.body[0].z,
                    angle: p.angle,
                    color: p.color,
                    score: p.score
                });
            }
        }
        return pack;
    }
}

export default Game;