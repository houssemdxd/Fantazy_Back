import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoundDocument = Round & Document;

@Schema()
export class Round {
  @Prop({ required: true })
  roundNumber: number;

}

export const RoundSchema = SchemaFactory.createForClass(Round);
