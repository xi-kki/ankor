// Offline Breathing Exercise for Ankore
// Works completely offline - no server calls needed

class OfflineBreathing {
  constructor() {
    this.isRunning = false;
    this.currentPhase = 'idle';
    this.timer = null;
    this.patterns = {
      // 4-4-6-2 pattern (from main app)
      calm: {
        name: 'Calming Breath',
        description: 'A calming 4-4-6-2 pattern',
        inhale: 4,
        holdIn: 4,
        exhale: 6,
        holdOut: 2,
      },
      // Box breathing (Navy SEAL)
      box: {
        name: 'Box Breathing',
        description: 'Equal 4-count pattern used by Navy SEALs',
        inhale: 4,
        holdIn: 4,
        exhale: 4,
        holdOut: 4,
      },
      // 4-7-8 relaxation
      relax: {
        name: '4-7-8 Relaxation',
        description: 'Deep relaxation pattern',
        inhale: 4,
        holdIn: 7,
        exhale: 8,
        holdOut: 0,
      },
      // Quick calm
      quick: {
        name: 'Quick Calm',
        description: 'Fast anxiety relief',
        inhale: 3,
        holdIn: 0,
        exhale: 5,
        holdOut: 0,
      },
    };

    this.currentPattern = this.patterns.calm;
    this.cyclesCompleted = 0;
    this.totalCycles = 5;
  }

  // Start breathing exercise
  start(patternName = 'calm', cycles = 5) {
    if (this.isRunning) {
      return;
    }

    this.currentPattern = this.patterns[patternName] || this.patterns.calm;
    this.totalCycles = cycles;
    this.cyclesCompleted = 0;
    this.isRunning = true;

    this.startCycle();
  }

  // Start a single breathing cycle
  startCycle() {
    if (!this.isRunning || this.cyclesCompleted >= this.totalCycles) {
      this.stop();
      return;
    }

    const { inhale, holdIn, exhale, holdOut } = this.currentPattern;
    const sequence = [];

    // Build sequence
    if (inhale > 0) {
      sequence.push({ phase: 'inhale', duration: inhale });
    }
    if (holdIn > 0) {
      sequence.push({ phase: 'holdIn', duration: holdIn });
    }
    if (exhale > 0) {
      sequence.push({ phase: 'exhale', duration: exhale });
    }
    if (holdOut > 0) {
      sequence.push({ phase: 'holdOut', duration: holdOut });
    }

    this.runSequence(sequence, 0);
  }

  // Run the breathing sequence
  async runSequence(sequence, index) {
    if (!this.isRunning || index >= sequence.length) {
      this.cyclesCompleted++;
      if (this.isRunning) {
        this.startCycle(); // Start next cycle
      }
      return;
    }

    const step = sequence[index];
    this.currentPhase = step.phase;

    // Notify UI
    this.onPhaseChange?.(step.phase, step.duration);

    // Wait for duration
    await this.sleep(step.duration * 1000);

    // Run next step
    this.runSequence(sequence, index + 1);
  }

  // Stop the exercise
  stop() {
    this.isRunning = false;
    this.currentPhase = 'idle';
    this.onPhaseChange?.('idle', 0);
  }

  // Pause/Resume
  pause() {
    this.isRunning = false;
  }

  resume() {
    if (!this.isRunning && this.currentPhase === 'idle') {
      this.startCycle();
    }
  }

  // Sleep utility
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Get current progress
  getProgress() {
    return {
      phase: this.currentPhase,
      cycle: this.cyclesCompleted,
      totalCycles: this.totalCycles,
      pattern: this.currentPattern.name,
      percentComplete: (this.cyclesCompleted / this.totalCycles) * 100,
    };
  }

  // Get available patterns
  getPatterns() {
    return Object.entries(this.patterns).map(([key, value]) => ({
      id: key,
      ...value,
    }));
  }

  // Set custom pattern
  setCustomPattern(inhale, holdIn, exhale, holdOut) {
    this.patterns.custom = {
      name: 'Custom',
      description: 'Your custom breathing pattern',
      inhale,
      holdIn,
      exhale,
      holdOut,
    };
  }
}

// Create singleton instance
const offlineBreathing = new OfflineBreathing();

// Export for use in other scripts
window.offlineBreathing = offlineBreathing;
