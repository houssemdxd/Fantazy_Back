import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as schedule from 'node-schedule';
import { Types } from 'mongoose';
import { FixtureService } from 'src/fixture/fixture.service';
import { RoundService } from 'src/round/round.service';
import { Team } from 'src/team/entities/team.entity';
import { FantasyTeamService } from 'src/fantasy-team/fantasy-team.service';
import { AuthService } from 'src/auth/auth.service';
import { PlayerStatsService } from 'src/player-stats/player-stats.service';

@Injectable()
export class RoundSchedulerService {
  private round = 0;
  private readonly logger = new Logger(RoundSchedulerService.name);
  constructor(
private readonly fixtureService: FixtureService,
private readonly roundService :RoundService,
private readonly fantazyteam :FantasyTeamService,
private readonly userService :AuthService,
private readonly playerStatService : PlayerStatsService


  ) {} // ✅ Injected here
private isCronRunning = false;




//@Cron('0 */1 * * * *') // Every 2 minutes
/*
async handleCron() {
  if (this.isCronRunning) return;
  this.isCronRunning = true;

  try {
    this.round = (await this.roundService.createRound()).roundNumber;
    this.logger.log(`🚀 Creating fixtures for Round ${this.round}`);
    await this.playerStatService.generateRandomStatsForLastRound();
    const fixtures = await this.fixtureService.createFixturesFromApi();

    fixtures.forEach((fixture, index) => {
      const matchTime = new Date(fixture.date + 'T' + fixture.eventTime);
      this.logger.log(`📅 Scheduling live update for Fixture ${index + 1} at ${matchTime.toISOString()}`);

      schedule.scheduleJob(matchTime, async () => {
        this.logger.log(`⚽ Starting live updates: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
        const interval = setInterval(async () => {
          this.logger.log(`🔄 [Live] ${fixture.homeTeam} vs ${fixture.awayTeam}`);
          await this.fantazyteam.updateLivePlayerStatsFromApi();
          const users = await this.userService.getAllUsers();
          for (const user of users) {
            await this.fantazyteam.calculateScore(user._id.toString());
          }
        }, 10000);

        const stopTime = new Date(matchTime.getTime() + 1 * 60 * 1000);
        schedule.scheduleJob(stopTime, () => {
          clearInterval(interval);
          this.logger.log(`🛑 Stopped live updates: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
        });
      });
    });
  } finally {
    this.isCronRunning = false;
  }
}*/

}
