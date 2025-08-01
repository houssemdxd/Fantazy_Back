import { Injectable } from '@nestjs/common';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';
import { InjectModel } from '@nestjs/mongoose';
import { FlattenMaps, Model, Types } from 'mongoose';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { Player } from 'src/player/entities/player.entity';
import { Fixture } from 'src/fixture/entities/fixture.entity';
import { Team } from 'src/team/entities/team.entity';
import { Round } from 'src/round/entities/round.entity';
import { WeeklyTeam } from 'src/weekly-team/entities/weekly-team.entity';
import { PlayerStat } from 'src/player-stats/entities/player-stat.entity';
import { WeeklyScore } from 'src/weekly-score/entities/weekly-score.entity';

@Injectable()
export class FantasyTeamService {


 constructor(
    @InjectModel('FantasyTeam') private readonly fantasyTeamModel: Model<FantasyTeam>,
    @InjectModel('Fixture') private readonly fixtureModel: Model<Fixture>,
    @InjectModel('Team') private readonly teamModel: Model<Team>,
    @InjectModel('Round') private readonly roundModel: Model<Round>,
@InjectModel(WeeklyTeam.name) private readonly weeklyTeamModel: Model<WeeklyTeam>,
    @InjectModel('Player') private readonly playerModel: Model<Player>,
        @InjectModel('PlayerStat') private readonly playerStatModel: Model<PlayerStat>,
        @InjectModel('WeeklyScore') private readonly WeeklyScoreModel: Model<WeeklyScore>,


    
  ) {}
async getPlayerStatsByUser(userId: string) {
  // 1. Fetch all rounds sorted ascending by roundNumber
  const rounds = await this.roundModel.find().sort({ roundNumber: 1 }).lean();

  if (rounds.length === 0) {
    console.warn('No rounds found in DB');
    return [];
  }

  // Get the latest round (current round)
  const currentRound = rounds[rounds.length - 1];

  // 2. Fetch all weekly teams of the user, sorted by roundNumber ascending (populate round)
  const weeklyTeams = await this.weeklyTeamModel
    .find({ user_id: new Types.ObjectId(userId) })
    .populate('round')
    .sort({ 'round.roundNumber': 1 })
    .lean();

  if (weeklyTeams.length === 0) {
    console.warn('No weekly teams found for user:', userId);
    return [];
  }

  // 3. Create a map from roundNumber to weeklyTeam for quick lookup
  const weeklyTeamMap = new Map<number, any>();
  for (const team of weeklyTeams) {
    const roundObj = team.round as { _id: Types.ObjectId; roundNumber: number };
    if (roundObj?.roundNumber !== undefined) {
      weeklyTeamMap.set(roundObj.roundNumber, team);
    }
  }

  const results = [];

  let lastKnownTeam = null;

  // 4. Loop from round 1 to currentRound.roundNumber (all rounds)
  for (const round of rounds) {
    if (round.roundNumber > currentRound.roundNumber) break; // stop if round beyond currentRound

    // Update lastKnownTeam if user has a team for this round
    if (weeklyTeamMap.has(round.roundNumber)) {
      lastKnownTeam = weeklyTeamMap.get(round.roundNumber);
    }

    if (!lastKnownTeam) {
      // If no team at all so far, skip or push empty players
      results.push({
        round: round.roundNumber,
        players: [],
      });
      continue;
    }

    // 5. Get fantasy players for the last known team (for the round)
    const fantasyPlayers = await this.fantasyTeamModel
      .find({ WeeklyTeam: lastKnownTeam._id })
      .lean();

    // Extract player IDs
    const playerIds = fantasyPlayers.map(fp => fp.player_id);

    // 6. Fetch PlayerStats for these players but **for the current round** (important!)
    const playerStats = await this.playerStatModel
      .find({
        round_id: round._id,        // round_id matches current round's _id here
        player_id: { $in: playerIds },
      })
      .lean();

    // 7. Fetch player details for these player IDs
    const players = await this.playerModel
      .find({ _id: { $in: playerIds } })
      .lean();

    // 8. Merge player info with their score for this round
    const playersWithStats = players.map(player => {
      const stat = playerStats.find(ps => ps.player_id === player._id);
      return {
        _id: player._id,
        name: player.name,
        position: player.position,
        image: player.image,
        score: stat?.score ?? 0,
      };
    });

    // 9. Add to results
    results.push({
      round: round.roundNumber,
      players: playersWithStats,
    });
  }

  return results;
}
//------------------------------------------------------------------------------------------------------------------------


//---------------------------------------------------------------------------------------------------------------------
async getLatestFantasyTeamWithAdversaryInfo(userId: string) {

  const userObjectId = new Types.ObjectId(userId);
// 1. Get ALL WeeklyTeams for this user and populate round
const allWeeklyTeams = await this.weeklyTeamModel
  .find({ user_id: userObjectId })
  .populate('round')
  .exec();

if (!allWeeklyTeams.length) {
  return { weeklyTeamId: null, players: [] };
}

// 2. Sort by round.roundNumber in memory
const latestWeeklyTeam = allWeeklyTeams.reduce((latest, current) => {
  const currentRoundNumber = (current.round as Round)?.roundNumber || 0;
  const latestRoundNumber = (latest.round as Round)?.roundNumber || 0;
  return currentRoundNumber > latestRoundNumber ? current : latest;
});

  if (!latestWeeklyTeam || !latestWeeklyTeam.round) {
    return { weeklyTeamId: latestWeeklyTeam?._id ?? null, players: [] };
  }

  //const currentRound = latestWeeklyTeam.round as FlattenMaps<Round>;
  const currentRound = await this.roundModel.findOne().sort({ roundNumber: -1 }).exec();

  // 2. Get the fantasy players
  const fantasyPlayers = await this.fantasyTeamModel
    .find({ WeeklyTeam: latestWeeklyTeam._id })
    .populate({
      path: 'player_id',
      populate: { path: 'team_id' },
    })
    .exec();

  // 3. Map and enrich each fantasy player
  const enrichedPlayers = await Promise.all(
    fantasyPlayers.map(async (entry) => {
      const player = entry.player_id as any;
      if (!player || !player.team_id) return null;

      const teamId = player.team_id._id;

      // Use the round from latestWeeklyTeam, NOT latestRound from roundModel
      const fixture = await this.fixtureModel
        .findOne({
          round: (currentRound as any)._id,
          $or: [
            { homeTeam: teamId },
            { awayTeam: teamId },
          ],
        })
        .populate(['homeTeam', 'awayTeam'])
        .lean();
        console.log("this is iteh team id we looking for "+teamId)
        console.log("thusis the  last round id "+(currentRound as any)._id,)
        console.log("rkgfoierhgiurgurigbtr"+entry)
      const result = {
        id:player.id,
        name: player.name,
        position: player.position,
        team: player.team_id.name,
        adversary: null as string | null,
        score: 0,
        isCaptain: entry.isCaptain,
        isViceCaptain: entry.isViceCaptain,
        isBench: entry.isBench,
        dispaly_ennemy :false
      };
      console.log("fixture before the if conditio "+fixture)
      if (fixture) {
        console.log("ficxture inside the if ")
        const eventDateTime = new Date(`${fixture.date}T${fixture.eventTime}`);
        console.log( fixture.homeTeam +" "+ eventDateTime)
        const hasPlayed = eventDateTime < new Date();
        result.dispaly_ennemy = !hasPlayed


        console.log("hasplayed value : "+hasPlayed)
        const adversaryTeam =
          fixture.homeTeam._id.toString() === teamId.toString()
            ? fixture.awayTeam
            : fixture.homeTeam;

  // Check if it's populated (has name property) or just an ObjectId
  if (adversaryTeam && typeof adversaryTeam === 'object' && 'name' in adversaryTeam) {
    result.adversary = (adversaryTeam as any).name;
  } else {
    // Fallback: it's still an ObjectId, so we need to fetch the team
    const teamDoc = await this.teamModel.findById(adversaryTeam).lean();

    const scorePlayer = (
  await this.playerStatModel.findOne({
    round: currentRound,
    player_id: new Types.ObjectId(player.id),
  })
)?.score

    console.log("thi sis the score "+scorePlayer)

    result.adversary = teamDoc?.name || 'Unknown Team';
    result.score  = scorePlayer
  }



        console.log(hasPlayed)
        // If match has been played, get score
        if (hasPlayed) {
            console.log("########################try to het the score of the player ")
            console.log(player._id)
            console.log(currentRound)
                var  round_if = this.roundModel.findOne({roundNumber : currentRound.roundNumber});


var lastroundid= (await round_if).id

console.log(lastroundid)
          const stat = await this.playerStatModel.findOne({
            player_id: player._id,
            round_id: new Types.ObjectId(lastroundid),
          }).lean();

            console.log("hioooooooooooooooooooooooooooo"+stat)

          if (stat) {
            result.score = stat.score || 0;
          }
        }
      }

      return result;
    })
  );

  return {
    weeklyTeamId: latestWeeklyTeam._id,
    players: enrichedPlayers.filter((p) => p !== null),
  };
}

//-------------------------------------------------------------------------------------------------------------------------------------------------
async calculateScore(userId: string): Promise<void> {
  // 1. Get the latest fantasy team
  const fantasyTeam = await this.getLatestFantasyTeamWithAdversaryInfo(userId);

  if (!fantasyTeam || !fantasyTeam.players || fantasyTeam.players.length === 0) {
    throw new Error('No fantasy team found or team is empty.');
  }

  //console.log(fantasyTeam)
  let totalScore = 0;

var currentRound =  this.roundModel
    .findOne()
    .sort({ roundNumber: -1 }) // Sort descending by roundNumber
    .exec();
    var currentRoundId = (await currentRound)._id

  for (const player of fantasyTeam.players) {
    // 2. Get player stat
    const playerStat = await this.playerStatModel.findOne({
      player_id: player.id,
      round_id:  currentRoundId, // You must ensure roundId is included in the result
    });
            console.log("this istge plkayer stats"+playerStat)
    if (!playerStat) continue; // Skip if no stats found

    let score = playerStat.score || 0;

    // 3. Apply user settings
    if (player.isCaptain) {
      score *= 2;
    } else if (player.isViceCaptain) {
      score *= 1.5;
    } else if (player.isBench) {
      score = 0;
    }

    // 4. Accumulate
    totalScore += score;
  }

  // 5. Upsert WeeklyScore (insert or update)
  await this.WeeklyScoreModel.findOneAndUpdate(
    {
      user: new Types.ObjectId(userId),
      round: currentRoundId,
    },
    {
      user:  new Types.ObjectId(userId),
      round: currentRoundId,
      score: totalScore,
    },
    { upsert: true, new: true }
  );
}
async updateFantasyTeam(
  userId: string,
  players: {
    player_id: number;
    isCaptain: boolean;
    isViceCaptain: boolean;
    isBench: boolean;
  }[],
): Promise<void> {
  const userObjectId = new Types.ObjectId(userId);

  // Get latest round
  const currentRound = await this.roundModel.findOne().sort({ roundNumber: -1 }).exec();
  if (!currentRound) throw new Error('No round found');

  // Get user's last WeeklyTeam
  const lastWeeklyTeam = await this.getLastWeeklyTeam(userId);

  console.log("this is the the last weklyteam "+lastWeeklyTeam.round)
  console.log("this is the last round id "+currentRound)
if (
  lastWeeklyTeam &&
  String((lastWeeklyTeam.round as any)._id || lastWeeklyTeam.round) === String(currentRound._id)
) {
  const weeklyTeamId = (lastWeeklyTeam as any)._id;

  // ✅ REMOVE ALL existing fantasy players for that weekly team
  await this.fantasyTeamModel.deleteMany({ WeeklyTeam: weeklyTeamId });

  // ✅ Filter out duplicates from input
  const uniquePlayersMap = new Map<number, any>();
  for (const player of players) {
    uniquePlayersMap.set(player.player_id, player);
  }
  const uniquePlayers = [...uniquePlayersMap.values()];

  // ✅ Insert all fresh
  const newFantasyPlayers = uniquePlayers.map((player) => ({
    player_id: player.player_id,
    isCaptain: player.isCaptain,
    isViceCaptain: player.isViceCaptain,
    isBench: player.isBench,
    WeeklyTeam: weeklyTeamId,
  }));

  await this.fantasyTeamModel.insertMany(newFantasyPlayers);

  console.log('✅ Fantasy team replaced for existing weekly team.');
}


 else {
    // 🆕 Create new WeeklyTeam
    const newWeeklyTeam = await this.weeklyTeamModel.create({
      user_id: userObjectId,
      round: currentRound._id,
      nb_transfert: 2,
      score: 0,
    });

    // Insert new FantasyTeam entries
    const fantasyTeams = players.map(player => ({
      player_id: player.player_id,
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      isBench: player.isBench,
      WeeklyTeam: newWeeklyTeam._id,
    }));

    await this.fantasyTeamModel.insertMany(fantasyTeams);
    console.log("fantazyteam created new ")
  }
}

async getLastWeeklyTeam(userId: string): Promise<WeeklyTeam | null> {
  const teams = await this.weeklyTeamModel
    .find({ user_id: new Types.ObjectId(userId) })
    .populate('round')
    .exec();
  if (!teams.length) return null;

  // Sort manually by round.roundNumber
  teams.sort((a, b) => {
    const aRoundNumber = (a.round as Round).roundNumber
    const bRoundNumber = (b.round as Round).roundNumber
    return bRoundNumber - aRoundNumber; // descending
  });
  return teams[0];
}






//--------------------------------------------------------------------------------------------------------------------------------------------

async saveFantasyTeam(
  userId: string,
  players: {
    player_id: number;
    isCaptain: boolean;
    isViceCaptain: boolean;
    isBench: boolean;
  }[],
): Promise<FantasyTeam[]> {
  const userObjectId = new Types.ObjectId(userId);

  // 1. Get the latest round (assumes roundNumber is increasing)
  const latestRound = await this.roundModel.findOne().sort({ roundNumber: -1 });
  if (!latestRound) {
    throw new Error('No round found');
  }

  // 2. Create a new WeeklyTeam
  const weeklyTeam = await this.weeklyTeamModel.create({
    user_id: userObjectId,
    round: latestRound._id,
    nb_transfert: 2,
    score: 0,
  });

  // 3. Delete previous fantasy team for this user
 // await this.fantasyTeamModel.deleteMany({ WeeklyTeam: weeklyTeam._id });

  // 4. Create the new fantasy team linked to the WeeklyTeam
  const fantasyTeamDocs = players.map((player) => ({
    player_id: player.player_id,
    isCaptain: player.isCaptain,
    isViceCaptain: player.isViceCaptain,
    isBench: player.isBench,
    WeeklyTeam: weeklyTeam._id, // link to new weekly team
  }));

  const createdFantasyTeam = await this.fantasyTeamModel.insertMany(fantasyTeamDocs);

  // 5. Optionally update weeklyTeam to reference one of its fantasy players
  // (If this is necessary, otherwise skip it)
  if (createdFantasyTeam.length > 0) {
    await this.weeklyTeamModel.updateOne(
      { _id: weeklyTeam._id },
      { fantasyTeam: createdFantasyTeam[0]._id } // or use a better strategy
    );
  }

  return createdFantasyTeam;
}

//-------------------------------------------------------------------------------------------------------------------------------------------------

  create() {
    return 'This action adds a new fantasyTeam';
  }

  findAll() {
    return `This action returns all fantasyTeam`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fantasyTeam`;
  }

  update(id: number, updateFantasyTeamDto: UpdateFantasyTeamDto) {
    return `This action updates a #${id} fantasyTeam`;
  }

  remove(id: number) {
    return `This action removes a #${id} fantasyTeam`;
  }




 getSampleFixturesResponse() {
  return   { "success": 1,
    "result": [{
        "event_key": 1433003,
        "event_date": "2025-04-20",
        "event_time": "15:30",
        "event_home_team": "EGS Gafsa",
        "home_team_key": 7594,
        "event_away_team": "Bizertin",
        "away_team_key": 7623,
        "event_halftime_result": "1 - 0",
        "event_final_result": "2 - 0",
        "event_ft_result": "2 - 0",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Stade du 7 Novembre (Gafsa)",
        "event_referee": "H. Jeaied",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7594_egs-gafsa.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7623_bizertin.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "3",
            "home_scorer": "A. Jouini",
            "home_scorer_id": "",
            "home_assist": "A. Ajmani",
            "home_assist_id": "",
            "score": "1 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "60",
            "home_scorer": "F. Ben Hassine",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "2 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "Penalty",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "72",
            "home_scorer": {
                "in": "H. Mhamedi",
                "out": "T. Alkhaly",
                "in_id": 870347753,
                "out_id": 3312626380
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "72",
            "home_scorer": {
                "in": "A. Omrani",
                "out": "F. Ben Hassine",
                "in_id": 649305047,
                "out_id": 2490236468
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "72",
            "home_scorer": {
                "in": "A. Barbati",
                "out": "A. Ajmani",
                "in_id": 1620900779,
                "out_id": 96295409
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "88",
            "home_scorer": {
                "in": "H. Mbarek",
                "out": "A. Jouini",
                "in_id": 1552140021,
                "out_id": 3846520265
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "90+4",
            "home_scorer": {
                "in": "N. Khedher",
                "out": "H. Ben Chaieb",
                "in_id": 3148963986,
                "out_id": 26749511
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "A. Chaabene",
                "out": "K. Balbouz",
                "in_id": 1329927409,
                "out_id": 3523177678
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "M. Khelifi",
                "out": "I. Midani",
                "in_id": 2270941854,
                "out_id": 2310031444
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "61",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "C. Abdelli",
                "out": "M. Doukali",
                "in_id": 1712300724,
                "out_id": 1593219001
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "78",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "H. Hammami",
                "out": "M. Seydi",
                "in_id": 285774370,
                "out_id": 913675589
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "78",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "O. Charfeddine",
                "out": "A. Kant\u00e9",
                "in_id": 1713428486,
                "out_id": 395566515
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "34",
            "home_fault": "S. Mejri",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "3534885823",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "45",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "R. Rehimi",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "59",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "S. Saidi",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [{
                    "player": "R. Jeridi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 368767149,
                    "info_time": ""
                }, {
                    "player": "S. Majeri",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3534885823,
                    "info_time": ""
                }, {
                    "player": "O. Jebali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4122143947,
                    "info_time": ""
                }, {
                    "player": "A. Horchani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 121769938,
                    "info_time": ""
                }, {
                    "player": "A. Chebbi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3225790391,
                    "info_time": ""
                }, {
                    "player": "T. Alkhaly",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3312626380,
                    "info_time": ""
                }, {
                    "player": "H. Ben Chaieb",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 26749511,
                    "info_time": ""
                }, {
                    "player": "A. Jouini",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3846520265,
                    "info_time": ""
                }, {
                    "player": "H. Ben Mbarek",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4231957780,
                    "info_time": ""
                }, {
                    "player": "F. Ben Hassine",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2490236468,
                    "info_time": ""
                }, {
                    "player": "A. Ajmani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 96295409,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "H. Mhamedi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 870347753,
                    "info_time": ""
                }, {
                    "player": "A. Omrani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 649305047,
                    "info_time": ""
                }, {
                    "player": "A. Barbati",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1620900779,
                    "info_time": ""
                }, {
                    "player": "H. Mbarek",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1552140021,
                    "info_time": ""
                }, {
                    "player": "N. Khedher",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3148963986,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "S. Kasri",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [{
                    "player": "S. Saidi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1097855094,
                    "info_time": ""
                }, {
                    "player": "M. Doukali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1593219001,
                    "info_time": ""
                }, {
                    "player": "A. Gueblia",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2753034868,
                    "info_time": ""
                }, {
                    "player": "Aymen Amri",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1620211341,
                    "info_time": ""
                }, {
                    "player": "A. Seydi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 881390842,
                    "info_time": ""
                }, {
                    "player": "A. Kant\u00e9",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 395566515,
                    "info_time": ""
                }, {
                    "player": "R. Rehimi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1223453205,
                    "info_time": ""
                }, {
                    "player": "I. Midani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2310031444,
                    "info_time": ""
                }, {
                    "player": "K. Balbouz",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3523177678,
                    "info_time": ""
                }, {
                    "player": "M. Seydi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 913675589,
                    "info_time": ""
                }, {
                    "player": "O. Ayiden",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4094905863,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "A. Chaabene",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1329927409,
                    "info_time": ""
                }, {
                    "player": "M. Khelifi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2270941854,
                    "info_time": ""
                }, {
                    "player": "C. Abdelli",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1712300724,
                    "info_time": ""
                }, {
                    "player": "H. Hammami",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 285774370,
                    "info_time": ""
                }, {
                    "player": "O. Charfeddine",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1713428486,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "N. Oumaya",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Penalty",
            "home": "1",
            "away": "0"
        }, {
            "type": "Substitution",
            "home": "6",
            "away": "5"
        }, {
            "type": "Attacks",
            "home": "79",
            "away": "98"
        }, {
            "type": "Dangerous Attacks",
            "home": "33",
            "away": "52"
        }, {
            "type": "On Target",
            "home": "2",
            "away": "4"
        }, {
            "type": "Off Target",
            "home": "3",
            "away": "3"
        }]
    }, {
        "event_key": 1433005,
        "event_date": "2025-04-20",
        "event_time": "15:30",
        "event_home_team": "Ben Guerdane",
        "home_team_key": 7613,
        "event_away_team": "Gab\u00e8s",
        "away_team_key": 7600,
        "event_halftime_result": "2 - 0",
        "event_final_result": "3 - 0",
        "event_ft_result": "3 - 0",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Stade de Ben Guerdane (Ben Gardane)",
        "event_referee": "A. Lousif",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7613_ben-guerdane.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7600_gabes.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "3",
            "home_scorer": "Z. Machmoum",
            "home_scorer_id": "3375410225",
            "home_assist": "A. Taous",
            "home_assist_id": "776646365",
            "score": "1 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "40",
            "home_scorer": "R. Yaakoubi (o.g.)",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "2 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "90+6",
            "home_scorer": "I. Belwafi",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "3 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "75",
            "home_scorer": {
                "in": "M. Yeken",
                "out": "S. Labidi",
                "in_id": 272327509,
                "out_id": 4209590572
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "80",
            "home_scorer": {
                "in": "A. Ben Ahmed",
                "out": "A. Yaakoubi",
                "in_id": 271561317,
                "out_id": 3356788944
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "90+1",
            "home_scorer": {
                "in": "R. Chaibi",
                "out": "A. Loussoukou",
                "in_id": 2025148621,
                "out_id": 3017000656
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "F. Ben Ammar",
                "out": "N. Helali",
                "in_id": 1229809280,
                "out_id": 3320698633
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "54",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "M. Camara",
                "out": "A. Masasi",
                "in_id": 323150165,
                "out_id": 1578201655
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "64",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "W. Ferjani",
                "out": "A. Boulila",
                "in_id": 3963145443,
                "out_id": 2370537077
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "64",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "A. Jouini",
                "out": "M. Selmi",
                "in_id": 3426239101,
                "out_id": 109701639
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "83",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "F. Slimane",
                "out": "R. Yaakoubi",
                "in_id": 3466055720,
                "out_id": 1080703938
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "45+1",
            "home_fault": "H. Souissi",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "2798660687",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "90+6",
            "home_fault": "I. Belwafi",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [{
                    "player": "N. Farhati",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3027363019,
                    "info_time": ""
                }, {
                    "player": "G. Abderrazek",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4282866196,
                    "info_time": ""
                }, {
                    "player": "J. Ben Hassen",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3033156018,
                    "info_time": ""
                }, {
                    "player": "A. Yaakoubi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3356788944,
                    "info_time": ""
                }, {
                    "player": "A. Loussoukou",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3017000656,
                    "info_time": ""
                }, {
                    "player": "Z. Machmoum",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3375410225,
                    "info_time": ""
                }, {
                    "player": "H. Souissi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2798660687,
                    "info_time": ""
                }, {
                    "player": "S. Labidi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4209590572,
                    "info_time": ""
                }, {
                    "player": "J. Bida",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4283366350,
                    "info_time": ""
                }, {
                    "player": "A. Taous",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 776646365,
                    "info_time": ""
                }, {
                    "player": "I. Belwafi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 393372804,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "M. Yeken",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 272327509,
                    "info_time": ""
                }, {
                    "player": "A. Ben Ahmed",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 271561317,
                    "info_time": ""
                }, {
                    "player": "R. Chaibi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2025148621,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "A. Chaouat",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [{
                    "player": "H. Ben Atig",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3304892521,
                    "info_time": ""
                }, {
                    "player": "N. Helali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3320698633,
                    "info_time": ""
                }, {
                    "player": "N. El Beji",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1691330653,
                    "info_time": ""
                }, {
                    "player": "R. Yaakoubi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1080703938,
                    "info_time": ""
                }, {
                    "player": "H. Mansour",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3466167827,
                    "info_time": ""
                }, {
                    "player": "A. Masasi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1578201655,
                    "info_time": ""
                }, {
                    "player": "D. Maatougui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1509575504,
                    "info_time": ""
                }, {
                    "player": "G. Ahoudo",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1655984207,
                    "info_time": ""
                }, {
                    "player": "A. Boulila",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2370537077,
                    "info_time": ""
                }, {
                    "player": "M. Selmi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 109701639,
                    "info_time": ""
                }, {
                    "player": "D. Moukouba",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2053217917,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "F. Ben Ammar",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1229809280,
                    "info_time": ""
                }, {
                    "player": "M. Camara",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 323150165,
                    "info_time": ""
                }, {
                    "player": "W. Ferjani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3963145443,
                    "info_time": ""
                }, {
                    "player": "A. Jouini",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3426239101,
                    "info_time": ""
                }, {
                    "player": "F. Slimane",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3466055720,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "T. Jaraya",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": []
    }, {
        "event_key": 1433006,
        "event_date": "2025-07-26",
        "event_time": "12:18",
        "event_home_team": "Monastir",
        "home_team_key": 7616,
        "event_away_team": "Soliman",
        "away_team_key": 7617,
        "event_halftime_result": "3 - 0",
        "event_final_result": "3 - 0",
        "event_ft_result": "3 - 0",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Stade Mustapha Ben Jannet (Monastir)",
        "event_referee": "W. Mansri",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7616_monastir.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7617_soliman.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "5",
            "home_scorer": "A. Harzi",
            "home_scorer_id": "3218902574",
            "home_assist": "",
            "home_assist_id": "",
            "score": "1 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "27",
            "home_scorer": "H. Mastouri",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "2 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "37",
            "home_scorer": "M. Ghorbel",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "3 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }],
        "substitutes": [{
            "time": "46",
            "home_scorer": {
                "in": "R. Azzouz",
                "out": "M. Ghorbel",
                "in_id": 90492053,
                "out_id": 3076786475
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "84",
            "home_scorer": {
                "in": "K. Michael",
                "out": "M. Ganouni",
                "in_id": 1629895736,
                "out_id": 2885610920
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "84",
            "home_scorer": {
                "in": "Y. Abdelli",
                "out": "M. Orkuma",
                "in_id": 4252506600,
                "out_id": 3354571800
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "90+3",
            "home_scorer": {
                "in": "I. Khalifa",
                "out": "H. Mastouri",
                "in_id": 1206869524,
                "out_id": 376552069
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "90+3",
            "home_scorer": {
                "in": "Y. Dridi",
                "out": "L. Trayi",
                "in_id": 3699635601,
                "out_id": 3480215271
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "O. Hicheri",
                "out": "M. Boussetta",
                "in_id": 4155256877,
                "out_id": 910639561
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "Y. El Kassah",
                "out": "S. Sarr",
                "in_id": 2422485658,
                "out_id": 903890651
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "73",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "D. Jebli",
                "out": "M. Victor",
                "in_id": 3775686997,
                "out_id": 2023562320
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "73",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "F. Belaili",
                "out": "S. Ben Mansour",
                "in_id": 2953293794,
                "out_id": 3067196513
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "40",
            "home_fault": "M. Ghorbel",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "78",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "O. Hichri",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "81",
            "home_fault": "M. Ganouni",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "82",
            "home_fault": "A. Hallaoui",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "90+1",
            "home_fault": "H. Mastouri",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [{
                    "player": "A. Hallaoui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1932606334,
                    "info_time": ""
                }, {
                    "player": "C. Salhi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3854150071,
                    "info_time": ""
                }, {
                    "player": "F. Soltani",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3110331956,
                    "info_time": ""
                }, {
                    "player": "M. Ghorbel",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3076786475,
                    "info_time": ""
                }, {
                    "player": "M. Orkuma",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3354571800,
                    "info_time": ""
                }, {
                    "player": "A. Harzi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3218902574,
                    "info_time": ""
                }, {
                    "player": "M. Hadj Ali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1593231898,
                    "info_time": ""
                }, {
                    "player": "R. Chikhaoui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1432007301,
                    "info_time": ""
                }, {
                    "player": "L. Trayi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3480215271,
                    "info_time": ""
                }, {
                    "player": "M. Ganouni",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2885610920,
                    "info_time": ""
                }, {
                    "player": "H. Mastouri",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 376552069,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "R. Azzouz",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 90492053,
                    "info_time": ""
                }, {
                    "player": "K. Michael",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1629895736,
                    "info_time": ""
                }, {
                    "player": "Y. Abdelli",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4252506600,
                    "info_time": ""
                }, {
                    "player": "I. Khalifa",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1206869524,
                    "info_time": ""
                }, {
                    "player": "Y. Dridi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3699635601,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "M. Sahli",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [{
                    "player": "A. Nsibi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 239669012,
                    "info_time": ""
                }, {
                    "player": "H. Mabrouk",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2930020153,
                    "info_time": ""
                }, {
                    "player": "M. Boussetta",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 910639561,
                    "info_time": ""
                }, {
                    "player": "M. Triki",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1406704444,
                    "info_time": ""
                }, {
                    "player": "A. Majhed",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2163587075,
                    "info_time": ""
                }, {
                    "player": "G. Maatougui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2155831484,
                    "info_time": ""
                }, {
                    "player": "S. Sarr",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 903890651,
                    "info_time": ""
                }, {
                    "player": "A. Mesbah",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3402007227,
                    "info_time": ""
                }, {
                    "player": "I. El Abed",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2545932751,
                    "info_time": ""
                }, {
                    "player": "S. Ben Mansour",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3067196513,
                    "info_time": ""
                }, {
                    "player": "M. Victor",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2023562320,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "O. Hicheri",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4155256877,
                    "info_time": ""
                }, {
                    "player": "Y. El Kassah",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2422485658,
                    "info_time": ""
                }, {
                    "player": "D. Jebli",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3775686997,
                    "info_time": ""
                }, {
                    "player": "F. Belaili",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2953293794,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "S. Zarrouk",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Substitution",
            "home": "5",
            "away": "4"
        }, {
            "type": "Attacks",
            "home": "76",
            "away": "51"
        }, {
            "type": "Dangerous Attacks",
            "home": "38",
            "away": "21"
        }, {
            "type": "On Target",
            "home": "4",
            "away": "1"
        }, {
            "type": "Off Target",
            "home": "8",
            "away": "4"
        }]
    }, {
        "event_key": 1433007,
        "event_date": "2025-04-20",
        "event_time": "17:00",
        "event_home_team": "Club Africain",
        "home_team_key": 7622,
        "event_away_team": "ES Tunis",
        "away_team_key": 7611,
        "event_halftime_result": "1 - 1",
        "event_final_result": "1 - 3",
        "event_ft_result": "1 - 3",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Stade olympique Hammadi-Agrebi (Rad\u00e8s)",
        "event_referee": "Lu\u00eds Godinho",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7622_club-africain.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7611_es-tunis.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "12",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 1",
            "away_scorer": "H. Jelassi",
            "away_scorer_id": "1649416951",
            "away_assist": "C. Jebali",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "45+1",
            "home_scorer": "H. Labidi",
            "home_scorer_id": "1264561303",
            "home_assist": "",
            "home_assist_id": "",
            "score": "1 - 1",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "Penalty",
            "info_time": "1st Half"
        }, {
            "time": "85",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "1 - 2",
            "away_scorer": "Rodrigo Rodrigues",
            "away_scorer_id": "3681371034",
            "away_assist": "",
            "away_assist_id": "",
            "info": "Penalty",
            "info_time": "2nd Half"
        }, {
            "time": "90+2",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "1 - 3",
            "away_scorer": "A. Jabri",
            "away_scorer_id": "",
            "away_assist": "M. Ben Hamida",
            "away_assist_id": "2959852502",
            "info": "",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "59",
            "home_scorer": {
                "in": "W. Maghzaoui",
                "out": "P. Kinzumbi",
                "in_id": 2255169359,
                "out_id": 2894773409
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "68",
            "home_scorer": {
                "in": "Y. Bouabid",
                "out": "H. Labidi",
                "in_id": 3108615938,
                "out_id": 1264561303
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "84",
            "home_scorer": {
                "in": "K. Semakula",
                "out": "A. Khalil",
                "in_id": 3706096885,
                "out_id": 1771715832
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "84",
            "home_scorer": {
                "in": "M. Laajimi",
                "out": "G. Sghaier",
                "in_id": 1119393155,
                "out_id": 1764434756
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "84",
            "home_scorer": {
                "in": "B. Srarfi",
                "out": "H. Khadhraoui",
                "in_id": 1073132043,
                "out_id": 2274889817
            },
            "home_assist": null,
            "score": "substitution",
            "away_scorer": [],
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "42",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "E. Mokwana",
                "out": "A. Konat\u00e9",
                "in_id": 1525441306,
                "out_id": 3908032128
            },
            "away_assist": null,
            "info": null,
            "info_time": "1st Half"
        }, {
            "time": "72",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "W. Derbali",
                "out": "O. Ogbelu",
                "in_id": 3961745521,
                "out_id": 1442520909
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "72",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "Rodrigo Rodrigues",
                "out": "Yan Sasse",
                "in_id": 3681371034,
                "out_id": 2277449036
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }, {
            "time": "76",
            "home_scorer": [],
            "home_assist": null,
            "score": "substitution",
            "away_scorer": {
                "in": "R. Bouchniba",
                "out": "M. Ben Ali",
                "in_id": 1848484762,
                "out_id": 3523769002
            },
            "away_assist": null,
            "info": null,
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "21",
            "home_fault": "A. Khalil",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "1771715832",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "32",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "O. Ogbelu",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "59",
            "home_fault": "G. Yeferni",
            "card": "red card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "62",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "H. Jelassi",
            "info": "",
            "home_player_id": "",
            "away_player_id": "1649416951",
            "info_time": "2nd Half"
        }, {
            "time": "67",
            "home_fault": "G. Sghaier",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "1764434756",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "69",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "Yan Sasse",
            "info": "",
            "home_player_id": "",
            "away_player_id": "2277449036",
            "info_time": "2nd Half"
        }, {
            "time": "75",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "M. Ben Ali",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "88",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "M. Ben Hamida",
            "info": "",
            "home_player_id": "",
            "away_player_id": "2959852502",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [{
                    "player": "G. Yeferni",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3478336792,
                    "info_time": ""
                }, {
                    "player": "H. Ben Abda",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 11891809,
                    "info_time": ""
                }, {
                    "player": "G. Zaalouni",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3758989982,
                    "info_time": ""
                }, {
                    "player": "Ali Youssef",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3145658368,
                    "info_time": ""
                }, {
                    "player": "W. Tene Nkingne",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1465139882,
                    "info_time": ""
                }, {
                    "player": "A. Khalil",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1771715832,
                    "info_time": ""
                }, {
                    "player": "B. Ait Malek",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4160121776,
                    "info_time": ""
                }, {
                    "player": "G. Sghaier",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1764434756,
                    "info_time": ""
                }, {
                    "player": "H. Khadhraoui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2274889817,
                    "info_time": ""
                }, {
                    "player": "H. Labidi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1264561303,
                    "info_time": ""
                }, {
                    "player": "P. Kinzumbi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2894773409,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "W. Maghzaoui",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2255169359,
                    "info_time": ""
                }, {
                    "player": "Y. Bouabid",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3108615938,
                    "info_time": ""
                }, {
                    "player": "K. Semakula",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3706096885,
                    "info_time": ""
                }, {
                    "player": "M. Laajimi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1119393155,
                    "info_time": ""
                }, {
                    "player": "B. Srarfi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1073132043,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "D. Bettoni",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [{
                    "player": "B. Ben Sa\u00efd",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 808180437,
                    "info_time": ""
                }, {
                    "player": "H. Jelassi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1649416951,
                    "info_time": ""
                }, {
                    "player": "A. Ben Hamida",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2959852502,
                    "info_time": ""
                }, {
                    "player": "M. Touga\u00ef",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3833958794,
                    "info_time": ""
                }, {
                    "player": "M. Ben Ali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3523769002,
                    "info_time": ""
                }, {
                    "player": "C. Jebali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3189772167,
                    "info_time": ""
                }, {
                    "player": "K. Guenichi",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3927890930,
                    "info_time": ""
                }, {
                    "player": "O. Ogbelu",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1442520909,
                    "info_time": ""
                }, {
                    "player": "Yan Sasse",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2277449036,
                    "info_time": ""
                }, {
                    "player": "A. Konat\u00e9",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3908032128,
                    "info_time": ""
                }, {
                    "player": "A. Jabri",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2268979869,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "E. Mokwana",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1525441306,
                    "info_time": ""
                }, {
                    "player": "W. Derbali",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3961745521,
                    "info_time": ""
                }, {
                    "player": "Rodrigo Rodrigues",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3681371034,
                    "info_time": ""
                }, {
                    "player": "R. Bouchniba",
                    "player_number": 0,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1848484762,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "M. Kanzari",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Penalty",
            "home": "1",
            "away": "1"
        }, {
            "type": "Substitution",
            "home": "3",
            "away": "3"
        }, {
            "type": "Attacks",
            "home": "82",
            "away": "107"
        }, {
            "type": "Dangerous Attacks",
            "home": "51",
            "away": "70"
        }, {
            "type": "On Target",
            "home": "3",
            "away": "7"
        }, {
            "type": "Off Target",
            "home": "4",
            "away": "6"
        }]
    }, {
        "event_key": 1433004,
        "event_date": "2025-04-19",
        "event_time": "15:30",
        "event_home_team": "Olympique B\u00e9ja",
        "home_team_key": 7619,
        "event_away_team": "Stade Tunisien",
        "away_team_key": 7618,
        "event_halftime_result": "0 - 0",
        "event_final_result": "0 - 0",
        "event_ft_result": "0 - 0",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Terrain De Football Bir Bou Regba (Bir Bou Rekba)",
        "event_referee": "",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7619_olympique-beja.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7618_stade-tunisien.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [],
        "substitutes": [],
        "cards": [{
            "time": "16",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "K. Ayari",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "37",
            "home_fault": "M. Ali Ragoubi",
            "card": "red card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "51",
            "home_fault": "A. Abid",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "667904727",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "64",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "B. Mugisha",
            "info": "",
            "home_player_id": "",
            "away_player_id": "2598039059",
            "info_time": "2nd Half"
        }, {
            "time": "70",
            "home_fault": "B. Mkadem",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "Y. Zelfani",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [],
                "missing_players": []
            }
        },
        "statistics": []
    }, {
        "event_key": 1433008,
        "event_date": "2025-04-19",
        "event_time": "15:30",
        "event_home_team": "Zarzis",
        "home_team_key": 7605,
        "event_away_team": "Tataouine",
        "away_team_key": 7621,
        "event_halftime_result": "2 - 0",
        "event_final_result": "3 - 0",
        "event_ft_result": "3 - 0",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Complexe Sportif Abdessalem Kazouz (Zarzis)",
        "event_referee": "",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7605_zarzis.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7621_tataouine.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "4",
            "home_scorer": "N. Douihech",
            "home_scorer_id": "",
            "home_assist": "Y. Snana",
            "home_assist_id": "",
            "score": "1 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "6",
            "home_scorer": "Y. Snana",
            "home_scorer_id": "",
            "home_assist": "M. Rahmani",
            "home_assist_id": "",
            "score": "2 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "49",
            "home_scorer": "Y. Snana",
            "home_scorer_id": "",
            "home_assist": "G. Mahersi",
            "home_assist_id": "",
            "score": "3 - 0",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "46",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "P. Mevine",
                "out": "I. Rasheed",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "W. Timi",
                "out": "A. Kartli",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "62",
            "home_scorer": {
                "in": "A. Tajourii",
                "out": "G. Mahersi",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "63",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "H. Hammami",
                "out": "J. Diakite",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "71",
            "home_scorer": {
                "in": "R. Sghaier",
                "out": "N. Douihech",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "71",
            "home_scorer": {
                "in": "M. Y. Bousoukaya",
                "out": "M. Chouchane",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "81",
            "home_scorer": {
                "in": "T. Hamouda",
                "out": "Y. Snana",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "81",
            "home_scorer": {
                "in": "E. Bede",
                "out": "F. Ghouma",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "13",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "M. Jemai",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "35",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "I. Rasheed",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "90",
            "home_fault": "",
            "card": "red card",
            "away_fault": "",
            "info": "away",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "90+1",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "G. Khalfa",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "H. Jabnoun",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "M. Rached",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Substitution",
            "home": "6",
            "away": "3"
        }, {
            "type": "Attacks",
            "home": "87",
            "away": "88"
        }, {
            "type": "Dangerous Attacks",
            "home": "50",
            "away": "60"
        }, {
            "type": "On Target",
            "home": "6",
            "away": "4"
        }, {
            "type": "Off Target",
            "home": "8",
            "away": "9"
        }]
    }, {
        "event_key": 1433009,
        "event_date": "2025-04-19",
        "event_time": "15:30",
        "event_home_team": "CS Sfaxien",
        "home_team_key": 7614,
        "event_away_team": "M\u00e9tlaoui",
        "away_team_key": 7620,
        "event_halftime_result": "0 - 0",
        "event_final_result": "1 - 1",
        "event_ft_result": "1 - 1",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Stade Ta\u00efeb Mhiri (Sfax (Saf\u0101qis))",
        "event_referee": "",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7614_cs-sfaxien.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7620_metlaoui.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "81",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 1",
            "away_scorer": "N. Chachia",
            "away_scorer_id": "",
            "away_assist": "A. Ouled Behi",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "90",
            "home_scorer": "H. H. Haj",
            "home_scorer_id": "3374792465",
            "home_assist": "O. Ben Ali",
            "home_assist_id": "",
            "score": "1 - 1",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "60",
            "home_scorer": {
                "in": "M. Absi",
                "out": "B. M. Conte",
                "in_id": 0,
                "out_id": 2052995902
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "60",
            "home_scorer": {
                "in": "F. Winley",
                "out": "M. Gasmi",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "60",
            "home_scorer": {
                "in": "M. Aidi",
                "out": "A. Ajjal",
                "in_id": 0,
                "out_id": 3942241114
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "68",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "M. Diame Pape",
                "out": "A. Bouassida",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "68",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "N. Chachia",
                "out": "M. A. Ammar",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "80",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "S. Lingazou",
                "out": "B. N. Sylla",
                "in_id": 0,
                "out_id": 0
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "82",
            "home_scorer": {
                "in": "H. H. Haj",
                "out": "Cristo",
                "in_id": 3374792465,
                "out_id": 931887030
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "89",
            "home_fault": "A. Saidi",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "L. Dridi",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "I. Ben Younes",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Substitution",
            "home": "4",
            "away": "4"
        }, {
            "type": "Attacks",
            "home": "69",
            "away": "70"
        }, {
            "type": "Dangerous Attacks",
            "home": "45",
            "away": "29"
        }, {
            "type": "On Target",
            "home": "7",
            "away": "2"
        }, {
            "type": "Off Target",
            "home": "9",
            "away": "3"
        }]
    }, {
        "event_key": 1433010,
        "event_date": "2025-04-19",
        "event_time": "15:30",
        "event_home_team": "JS Omrane",
        "home_team_key": 23839,
        "event_away_team": "Etoile du Sahel",
        "away_team_key": 7612,
        "event_halftime_result": "0 - 3",
        "event_final_result": "1 - 4",
        "event_ft_result": "1 - 4",
        "event_penalty_result": "",
        "event_status": "Finished",
        "country_name": "Tunisia",
        "league_name": "Ligue 1",
        "league_key": 317,
        "league_round": "Round 27",
        "league_season": "2024\/2025",
        "event_live": "0",
        "event_stadium": "Complexe sportif Taieb ben Ammar El Omrane (Tunis)",
        "event_referee": "",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/23839_js-omrane.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7612_etoile-du-sahel.jpg",
        "event_country_key": 110,
        "league_logo": null,
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/110_tunisia.png",
        "event_home_formation": "",
        "event_away_formation": "",
        "fk_stage_key": 1653,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [{
            "time": "1",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 1",
            "away_scorer": "M. Anan",
            "away_scorer_id": "",
            "away_assist": "F. Chaouat",
            "away_assist_id": "2788944896",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "5",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 2",
            "away_scorer": "F. Chaouat",
            "away_scorer_id": "2788944896",
            "away_assist": "G. Naouali",
            "away_assist_id": "835656151",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "24",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 3",
            "away_scorer": "F. Chaouat",
            "away_scorer_id": "2788944896",
            "away_assist": "S. Ghedamsi",
            "away_assist_id": "1310507632",
            "info": "",
            "info_time": "1st Half"
        }, {
            "time": "69",
            "home_scorer": "",
            "home_scorer_id": "",
            "home_assist": "",
            "home_assist_id": "",
            "score": "0 - 4",
            "away_scorer": "F. Chaouat",
            "away_scorer_id": "2788944896",
            "away_assist": "A. Khardani",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "88",
            "home_scorer": "A. Hadhri",
            "home_scorer_id": "",
            "home_assist": "M. Souissi",
            "home_assist_id": "",
            "score": "1 - 4",
            "away_scorer": "",
            "away_scorer_id": "",
            "away_assist": "",
            "away_assist_id": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "substitutes": [{
            "time": "46",
            "home_scorer": {
                "in": "A. Kasmir",
                "out": "F. Mahdhaoui",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "46",
            "home_scorer": {
                "in": "M. A. Omri",
                "out": "K. Othmani",
                "in_id": 0,
                "out_id": 0
            },
            "home_assist": "",
            "score": "substitution",
            "away_scorer": [],
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "60",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "M. Chouchane",
                "out": "O. Abid",
                "in_id": 0,
                "out_id": 3587521995
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "60",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "Y. Sabeur",
                "out": "R. Aouani",
                "in_id": 0,
                "out_id": 4243976415
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }, {
            "time": "70",
            "home_scorer": [],
            "home_assist": "",
            "score": "substitution",
            "away_scorer": {
                "in": "M. Anan",
                "out": "Y. Chamakhi",
                "in_id": 0,
                "out_id": 1042853379
            },
            "away_assist": "",
            "info": "",
            "info_time": "2nd Half"
        }],
        "cards": [{
            "time": "10",
            "home_fault": "I. Ben Rejeb",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "21",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "C. Camara",
            "info": "",
            "home_player_id": "",
            "away_player_id": "1758111303",
            "info_time": "1st Half"
        }, {
            "time": "42",
            "home_fault": "G. Ben Hassine",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "1st Half"
        }, {
            "time": "49",
            "home_fault": "M. Jammel",
            "card": "yellow card",
            "away_fault": "",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "68",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "Y. Sabeur",
            "info": "",
            "home_player_id": "",
            "away_player_id": "",
            "info_time": "2nd Half"
        }, {
            "time": "81",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "Z. Boughattas",
            "info": "",
            "home_player_id": "",
            "away_player_id": "3970873090",
            "info_time": "2nd Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "L. Kadri",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [],
                "substitutes": [],
                "coaches": [{
                    "coache": "H. Daou",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Substitution",
            "home": "6",
            "away": "5"
        }, {
            "type": "Attacks",
            "home": "106",
            "away": "90"
        }, {
            "type": "Dangerous Attacks",
            "home": "81",
            "away": "57"
        }, {
            "type": "On Target",
            "home": "9",
            "away": "9"
        }, {
            "type": "Off Target",
            "home": "6",
            "away": "5"
        }]
    }]
}

  }











getSimplifiedFixtures() {
    const response = this.getSampleFixturesResponse();
    return response.result.map(fixture => ({
      homeTeam: fixture.event_home_team,
      homeTeamKey: fixture.home_team_key,
      awayTeam: fixture.event_away_team,
      awayTeamKey: fixture.away_team_key,
      eventTime: fixture.event_time,
      date: fixture.event_date,
      league: fixture.league_name,
      event_status :fixture.event_status
    }));
  }


async updateLivePlayerStatsFromApi() {
  console.log('[updateLivePlayerStatsFromApi] Starting update...');

  const apiData = this.getMockLiveScores();
  console.log('[updateLivePlayerStatsFromApi] Retrieved mock data:', JSON.stringify(apiData, null, 2));

  if (!apiData?.success || !Array.isArray(apiData.result)) {
    console.warn('[updateLivePlayerStatsFromApi] Invalid or missing result in API data');
    return;
  }

  const currentRound = await this.roundModel.findOne().sort({ roundNumber: -1 });
  if (!currentRound) {
    throw new Error('[updateLivePlayerStatsFromApi] No current round found');
  }

  for (const match of apiData.result) {
    const homeTeamId = Number(match.home_team_key);
    const awayTeamId = Number(match.away_team_key);

    const playerScores: Record<number, number> = {};
    const substituteScores: Record<number, number> = {}; // 1 or 2 points
    const allInMatchPlayers = new Set<number>(); // To track only those who played

    const subs = match.substitutes || [];
    const homeSubs = subs.filter(s => s.home_scorer);
    const awaySubs = subs.filter(s => s.away_scorer);

    // Step 1: Give 2 points to all starting XI
    for (const side of ['home_team', 'away_team']) {
      const lineup = match.lineups?.[side]?.starting_lineups || [];
      const teamId = side === 'home_team' ? homeTeamId : awayTeamId;

      for (const starter of lineup) {
        const player = await this.findPlayerByNameAndTeam(starter.player, teamId);
        if (!player) continue;
        substituteScores[player._id] = 2;
        allInMatchPlayers.add(player._id);
      }
    }

    // Step 2: Process substitutions
    for (const sub of [...homeSubs, ...awaySubs]) {
      const teamId = sub.home_scorer ? homeTeamId : awayTeamId;
      const outName = sub.home_scorer?.out || sub.away_scorer?.out;
      const inName = sub.home_scorer?.in || sub.away_scorer?.in;

      // Subbed out → reduce to 1 point
      if (outName) {
        const playerOut = await this.findPlayerByNameAndTeam(outName, teamId);
        if (playerOut && substituteScores[playerOut._id] === 2) {
          substituteScores[playerOut._id] = 1;
        }
      }

      // Subbed in → assign 1 point
      if (inName) {
        const playerIn = await this.findPlayerByNameAndTeam(inName, teamId);
        if (playerIn) {
          substituteScores[playerIn._id] = 1;
          allInMatchPlayers.add(playerIn._id);
        }
      }
    }

    // Step 3: Apply appearance scores
    for (const [playerIdStr, subScore] of Object.entries(substituteScores)) {
      const playerId = Number(playerIdStr);
      playerScores[playerId] = (playerScores[playerId] || 0) + subScore;
    }

    // Step 4: Goals (and own goals)
    for (const goal of match.goalscorers || []) {
      const isOwnGoal = (scorer: string) => scorer?.includes('(o.g.)');

      const processGoal = async (scorerName: string, teamId: number) => {
        if (!scorerName) return;
        const isOG = isOwnGoal(scorerName);
        const cleanName = scorerName.replace(' (o.g.)', '').trim();

        const player = await this.findPlayerByNameAndTeam(cleanName, teamId);
        if (!player) return;

        allInMatchPlayers.add(player._id);
        const points = isOG ? -2 : this.getGoalPointsByPosition(player.position);
        playerScores[player._id] = (playerScores[player._id] || 0) + points;
      };

      if (goal.home_scorer) await processGoal(goal.home_scorer, homeTeamId);
      if (goal.away_scorer) await processGoal(goal.away_scorer, awayTeamId);
    }

    // Step 5: Cards
    for (const card of match.cards || []) {
      const processCard = async (playerName: string, teamId: number, type: string) => {
        const player = await this.findPlayerByNameAndTeam(playerName, teamId);
        if (!player) return;
        allInMatchPlayers.add(player._id);

        const deduction = type === 'red card' ? -3 : -1;
        playerScores[player._id] = (playerScores[player._id] || 0) + deduction;
      };

      if (card.home_fault) await processCard(card.home_fault, homeTeamId, card.card);
      if (card.away_fault) await processCard(card.away_fault, awayTeamId, card.card);
    }

    // Step 6: Save only the players that actually played (lineup or subs)
    for (const [playerId, score] of Object.entries(playerScores)) {
      const pid = Number(playerId);
      if (!allInMatchPlayers.has(pid)) continue;

      await this.playerStatModel.findOneAndUpdate(
        { player_id: pid, round_id: currentRound._id },
        { $inc: { score: score } },
        { upsert: true, new: true }
      );
      console.log(`[DB Update] Player ${pid} → Score delta: ${score}`);
    }
  }

  console.log('[updateLivePlayerStatsFromApi] Finished updating player stats.');
}


// Supporting function for goal points by position (unchanged)
private getGoalPointsByPosition(position: string): number {
  switch (position?.toLowerCase()) {
    case 'goalkeepers':
      return 10;
    case 'defender':
      return 6;
    case 'midfielder':
      return 5;
    case 'forward':
    default:
      return 4;
  }
}

// Supporting function to find player by name and team (unchanged)
private async findPlayerByNameAndTeam(playerName: string, apiTeamId: number) {
  const team = await this.teamModel.findOne({ team_id: apiTeamId });
  if (!team) return null;

  return this.playerModel.findOne({
    name: { $regex: new RegExp(`^${this.escapeRegex(playerName)}$`, 'i') },
    team_id: team._id,
  });
}

// Regex escape (unchanged)
private escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}





  getMockLiveScores(): any {
    return {
    "success": 1,
    "result": [{
        "event_key": 1572949,
        "event_date": "2025-07-21",
        "event_time": "16:30",
        "event_home_team": "EGS Gafsa",
        "home_team_key": 7594,
        "event_away_team": "Bizertin",
        "away_team_key": 7623,
        "event_halftime_result": "0 - 0",
        "event_final_result": "0 - 0",
        "event_ft_result": "",
        "event_penalty_result": "",
        "event_status": "46",
        "country_name": "Tunisia",
        "league_name": "Ligue Professionnelle 1",
        "league_key": 344,
        "league_round": "Round 1",
        "league_season": "2025\/2026",
        "event_live": "1",
        "event_stadium": "",
        "event_referee": "Mohamed Benali, Tunisia",
        "home_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7594_egs-gafsa.jpg",
        "away_team_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/7623_bizertin.jpg",
        "event_country_key": 95,
        "league_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_leagues\/344_ligue-professionnelle-1.png",
        "country_logo": "https:\/\/apiv2.allsportsapi.com\/logo\/logo_country\/95_tunisia.png",
        "event_home_formation": "3-4-1-2",
        "event_away_formation": "4-2-3-1",
        "fk_stage_key": 1516,
        "stage_name": "Current",
        "league_group": null,
        "goalscorers": [
            {
              time: '34',
              home_scorer: '',
              score: '0 - 1',
              away_scorer: 'K. Amdouni',
            },

               {
              time: '75',
              home_scorer: '',
              score: '0 - 2',
              away_scorer: 'K. Amdouni',
            },



        ],
        "substitutes": [],
        "cards": [{
            "time": "11",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "K. Amdouni",
            "info": "",
            "home_player_id": "",
            "away_player_id": "3236899489",
            "info_time": "1st Half"
        }, {
            "time": "39",
            "home_fault": "",
            "card": "yellow card",
            "away_fault": "W. Ghozzi",
            "info": "",
            "home_player_id": "",
            "away_player_id": "1235053920",
            "info_time": "1st Half"
        }],
        "vars": {
            "home_team": [],
            "away_team": []
        },
        "lineups": {
            "home_team": {
                "starting_lineups": [{
                    "player": "O. Boufalgha",
                    "player_number": 1,
                    "player_position": 1,
                    "player_country": null,
                    "player_key": 4153598964,
                    "info_time": ""
                }, {
                    "player": "A. Frioui",
                    "player_number": 5,
                    "player_position": 2,
                    "player_country": null,
                    "player_key": 1247729373,
                    "info_time": ""
                }, {
                    "player": "R. Jeridi",
                    "player_number": 38,
                    "player_position": 3,
                    "player_country": null,
                    "player_key": 3551461654,
                    "info_time": ""
                }, {
                    "player": "R. Rabha",
                    "player_number": 44,
                    "player_position": 4,
                    "player_country": null,
                    "player_key": 2390880897,
                    "info_time": ""
                }, {
                    "player": "M. Yahiaoui",
                    "player_number": 31,
                    "player_position": 5,
                    "player_country": null,
                    "player_key": 1587886890,
                    "info_time": ""
                }, {
                    "player": "H. Abbès",
                    "player_number": 8,
                    "player_position": 6,
                    "player_country": null,
                    "player_key": 1005132206,
                    "info_time": ""
                }, {
                    "player": "N. Agbre",
                    "player_number": 33,
                    "player_position": 7,
                    "player_country": null,
                    "player_key": 3746544947,
                    "info_time": ""
                }, {
                    "player": "A. Barbati",
                    "player_number": 3,
                    "player_position": 8,
                    "player_country": null,
                    "player_key": 2371382726,
                    "info_time": ""
                }, {
                    "player": "B. Chaabani",
                    "player_number": 20,
                    "player_position": 9,
                    "player_country": null,
                    "player_key": 3241129426,
                    "info_time": ""
                }, {
                    "player": "A. Chebbi",
                    "player_number": 9,
                    "player_position": 10,
                    "player_country": null,
                    "player_key": 3422599257,
                    "info_time": ""
                }, {
                    "player": "A. Chokri",
                    "player_number": 7,
                    "player_position": 11,
                    "player_country": null,
                    "player_key": 2242913284,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "Andrey Khodanovich",
                    "player_number": 95,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 778692371,
                    "info_time": ""
                }, {
                    "player": "Nikolay Sysuev",
                    "player_number": 99,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3081256744,
                    "info_time": ""
                }, {
                    "player": "Danila Khotulev",
                    "player_number": 4,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1256505688,
                    "info_time": ""
                }, {
                    "player": "Maksim Syshchenko",
                    "player_number": 59,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3426939568,
                    "info_time": ""
                }, {
                    "player": "Stanislav Poroykov",
                    "player_number": 2,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1821228855,
                    "info_time": ""
                }, {
                    "player": "Aleksey Baranovskiy",
                    "player_number": 96,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 786516877,
                    "info_time": ""
                }, {
                    "player": "Stepan Oganesyan",
                    "player_number": 11,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3153584749,
                    "info_time": ""
                }, {
                    "player": "Evgeniy Bolotov",
                    "player_number": 57,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 4139143435,
                    "info_time": ""
                }, {
                    "player": "Aleksandr Lomakin",
                    "player_number": 17,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3494252740,
                    "info_time": ""
                }, {
                    "player": "Saeid Saharkhizan",
                    "player_number": 10,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3819266680,
                    "info_time": ""
                }, {
                    "player": "Gedeon Guzina",
                    "player_number": 30,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2874323482,
                    "info_time": ""
                }, {
                    "player": "Jordhy Thompson",
                    "player_number": 16,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1031681100,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "A. Mansouri",
                    "coache_country": null
                }],
                "missing_players": []
            },
            "away_team": {
                "starting_lineups": [{
                    "player": "K. Amdouni",
                    "player_number": 35,
                    "player_position": 1,
                    "player_country": null,
                    "player_key": 2595428187,
                    "info_time": ""
                }, {
                    "player": "W. Ghozzi",
                    "player_number": 22,
                    "player_position": 2,
                    "player_country": null,
                    "player_key": 1443763763,
                    "info_time": ""
                }, {
                    "player": "M. Hanzouli",
                    "player_number": 90,
                    "player_position": 3,
                    "player_country": null,
                    "player_key": 1235053920,
                    "info_time": ""
                }, {
                    "player": "A. Krir",
                    "player_number": 4,
                    "player_position": 4,
                    "player_country": null,
                    "player_key": 1785276560,
                    "info_time": ""
                }, {
                    "player": "S. Saidi",
                    "player_number": 27,
                    "player_position": 5,
                    "player_country": null,
                    "player_key": 4177909217,
                    "info_time": ""
                }, {
                    "player": "Akermi",
                    "player_number": 10,
                    "player_position": 6,
                    "player_country": null,
                    "player_key": 2609000225,
                    "info_time": ""
                }, {
                    "player": "Matvey Kislyak",
                    "player_number": 31,
                    "player_position": 7,
                    "player_country": null,
                    "player_key": 2141440049,
                    "info_time": ""
                }, {
                    "player": "Kirill Glebov",
                    "player_number": 17,
                    "player_position": 8,
                    "player_country": null,
                    "player_key": 3236899489,
                    "info_time": ""
                }, {
                    "player": "Artem Shumanskiy",
                    "player_number": 8,
                    "player_position": 9,
                    "player_country": null,
                    "player_key": 3941901646,
                    "info_time": ""
                }, {
                    "player": "Danil Krugovoy",
                    "player_number": 3,
                    "player_position": 10,
                    "player_country": null,
                    "player_key": 1528096451,
                    "info_time": ""
                }, {
                    "player": "Tamerlan Musaev",
                    "player_number": 11,
                    "player_position": 11,
                    "player_country": null,
                    "player_key": 304611866,
                    "info_time": ""
                }],
                "substitutes": [{
                    "player": "Vladislav Torop",
                    "player_number": 49,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1632391446,
                    "info_time": ""
                }, {
                    "player": "Egor Besaev",
                    "player_number": 85,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2075476281,
                    "info_time": ""
                }, {
                    "player": "Mikhail Ryadno",
                    "player_number": 68,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 524624712,
                    "info_time": ""
                }, {
                    "player": "Dzhamalutdin Abdulkadyrov",
                    "player_number": 23,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1471209977,
                    "info_time": ""
                }, {
                    "player": "Artem Bandikyan",
                    "player_number": 52,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 2672060954,
                    "info_time": ""
                }, {
                    "player": "Khellven",
                    "player_number": 13,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1292661913,
                    "info_time": ""
                }, {
                    "player": "Sekou Koita",
                    "player_number": 20,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 620333045,
                    "info_time": ""
                }, {
                    "player": "Alerrandro",
                    "player_number": 9,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 3630720486,
                    "info_time": ""
                }, {
                    "player": "Matheus Alves",
                    "player_number": 7,
                    "player_position": 0,
                    "player_country": null,
                    "player_key": 1064928307,
                    "info_time": ""
                }],
                "coaches": [{
                    "coache": "H. Zouaoui",
                    "coache_country": null
                }],
                "missing_players": []
            }
        },
        "statistics": [{
            "type": "Shots Total",
            "home": "3",
            "away": "6"
        }, {
            "type": "Shots On Goal",
            "home": "2",
            "away": "1"
        }, {
            "type": "Shots Off Goal",
            "home": "1",
            "away": "1"
        }, {
            "type": "Shots Blocked",
            "home": "0",
            "away": "4"
        }, {
            "type": "Shots Inside Box",
            "home": "2",
            "away": "3"
        }, {
            "type": "Shots Outside Box",
            "home": "1",
            "away": "3"
        }, {
            "type": "Fouls",
            "home": "8",
            "away": "7"
        }, {
            "type": "Corners",
            "home": "4",
            "away": "6"
        }, {
            "type": "Offsides",
            "home": "0",
            "away": "1"
        }, {
            "type": "Ball Possession",
            "home": "43%",
            "away": "57%"
        }, {
            "type": "Yellow Cards",
            "home": "0",
            "away": "1"
        }, {
            "type": "Saves",
            "home": "2",
            "away": "2"
        }, {
            "type": "Passes Total",
            "home": "115",
            "away": "159"
        }, {
            "type": "Passes Accurate",
            "home": "87",
            "away": "132"
        }]
    }]
}
}}