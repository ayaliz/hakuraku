import pako from "pako";
import { create, fromBinary } from "@bufbuild/protobuf";
import {Card, Chara, RaceInstance, SingleModeRank, Skill, SupportCard, TextData, UMDatabase, UMDatabaseSchema} from './data_pb';

class _UMDatabaseWrapper {
    umdb: UMDatabase = create(UMDatabaseSchema);
    charas: Record<number, Chara> = {};
    cards: Record<number, Card> = {};
    supportCards: Record<number, SupportCard> = {};
    raceInstances: Record<number, RaceInstance> = {};
    skills: Record<number, Skill> = {};
    skillNeedPoints: Record<number, number> = {};
    singleModeRanks: SingleModeRank[] = [];
    textData: Record<number, Record<number, TextData>> = {};
    // chara_id -> set of relation_type values that character belongs to
    charaRelationTypes: Record<number, Set<number>> = {};
    // relation_type -> relation_point
    relationPoints: Record<number, number> = {};

    initialize() {
        return fetch(import.meta.env.BASE_URL + 'data/umdb.binarypb.gz', {cache: 'no-cache'})
            .then(response => response.arrayBuffer())
            .then(response => {
                this.umdb = fromBinary(UMDatabaseSchema, pako.inflate(new Uint8Array(response)));

                this.umdb.chara.forEach((chara) => this.charas[chara.id!] = chara);
                this.umdb.card.forEach((card) => this.cards[card.id!] = card);
                this.umdb.supportCard.forEach((card) => this.supportCards[card.id!] = card);

                this.umdb.raceInstance.forEach((race) => this.raceInstances[race.id!] = race);

                this.umdb.skill.forEach((skill) => this.skills[skill.id!] = skill);

                this.umdb.singleModeSkillNeedPoint.forEach((entry) => {
                    this.skillNeedPoints[entry.id!] = entry.needSkillPoint!;
                });

                this.singleModeRanks = this.umdb.singleModeRank.slice();

                this.umdb.textData.forEach((text) => {
                    if (!this.textData[text.category!]) {
                        this.textData[text.category!] = {};
                    }
                    this.textData[text.category!][text.index!] = text;
                });

                this.umdb.successionRelation.forEach((r) => {
                    this.relationPoints[r.relationType!] = r.relationPoint!;
                });

                this.umdb.successionRelationMember.forEach((m) => {
                    const charaId = m.charaId!;
                    if (!this.charaRelationTypes[charaId]) {
                        this.charaRelationTypes[charaId] = new Set();
                    }
                    this.charaRelationTypes[charaId].add(m.relationType!);
                });
            });
    }

    raceInstanceNameWithId = (raceInstanceId: number) =>
        `${raceInstanceId} - ${this.raceInstances[raceInstanceId]?.name ?? 'Unknown race'}`;

    skillName = (skillId: number) =>
        this.skills[skillId]?.name ?? `Unknown Skill ${skillId}`;

    skillNameWithId = (skillId: number) =>
        `[${skillId}] ${this.skills[skillId]?.name ?? 'Unknown Skill'}`;

    getTextData = (category: number, index: number): TextData | undefined =>
        this.textData[category]?.[index];
}

const UMDatabaseWrapper = new _UMDatabaseWrapper();
export default UMDatabaseWrapper;
