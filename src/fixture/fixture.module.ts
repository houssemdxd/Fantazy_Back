import { Module } from '@nestjs/common';
import { FixtureService } from './fixture.service';
import { FixtureController } from './fixture.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Fixture, FixtureSchema } from './entities/fixture.entity';
import { Team, TeamSchema } from 'src/team/entities/team.entity';
import { Round, RoundSchema } from 'src/round/entities/round.entity';

@Module({
   imports: [
    MongooseModule.forFeature([


      
      { name: Fixture.name, schema: FixtureSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Round.name, schema: RoundSchema },

    ]),
  ],
  controllers: [FixtureController],
  providers: [FixtureService]
})
export class FixtureModule {}
