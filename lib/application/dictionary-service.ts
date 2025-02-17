import ExternalDictionary from '@lib/application/ports/external-dictionary.interface';
import DictionaryCache from '@lib/application/ports/dictionary-cache.interface';
import { IDictionaryEntry, DictionaryEntry } from '@lib/domain/dictionary-entry';

import { DictionaryResponse } from '@lib/application/ports/external-dictionary.interface';
import Logger from '@lib/application/ports/logger.interface';
import { partOfSpeechesTag, WordForm, Meaning } from '@lib/domain/dictionary-entry';

import { Either, left, right } from '@lib/shared/common/either';

type ApplicationError = {
	message: string;
	error?: any;
};

type InvalidWord = {
	message: string;
};

type WordResult = {
	word: string;
	partOfSpeech: partOfSpeechesTag[];
	wordForms: WordForm;
	meanings: Meaning[];
	additionalInfo?: string;
	status?: number;
};

export type WordResponse = Either<ApplicationError | InvalidWord, WordResult>;

export default class DictionaryService {
	private externalDictionary: ExternalDictionary;
	private logger: Logger;
	private dictionaryCache: DictionaryCache;

	constructor(externalDictionary: ExternalDictionary, dictionaryCache: DictionaryCache, logger: Logger) {
		this.externalDictionary = externalDictionary;
		this.logger = logger;
		this.dictionaryCache = dictionaryCache;
	}

	async getWord(word: string): Promise<WordResponse> {
		if (!word) {
			return left(this.handleInValidWordError());
		}

		const dictionaryResponse: DictionaryResponse = await this.getDictionaryEntry(word);

		if (dictionaryResponse.isLeft()) {
			return left(this.handleApplicationError());
		}

		const dictionaryEntry = dictionaryResponse.payload;

		const result: WordResult = {
			word: dictionaryEntry.getWord(),
			partOfSpeech: dictionaryEntry.getPartOfSpeech(),
			wordForms: dictionaryEntry.getWordForms(),
			meanings: dictionaryEntry.getMeanings(),
		};

		if (!this.dictionaryEntryExists(dictionaryEntry)) {
			return right({
				...result,
				additionalInfo: `www.sonaveeb.ee has no matching result for ${word}`,
				status: 400,
			});
		}

		return right(result);
	}

	private async getDictionaryEntry(word: string): Promise<DictionaryResponse> {
		const cachedDictionaryEntry = await this.dictionaryCache.get(word);

		if (cachedDictionaryEntry) {
			const dictionaryEntry = DictionaryEntry.fromJSON(JSON.parse(cachedDictionaryEntry));

			return right(dictionaryEntry);
		}

		const dictionaryResponse: DictionaryResponse = await this.externalDictionary.getWord(word);

		if (dictionaryResponse.isLeft()) {
			return dictionaryResponse;
		}

		const dictionaryEntry = dictionaryResponse.payload;

		if (dictionaryResponse.isRight() && this.dictionaryEntryExists(dictionaryEntry)) {
			await this.dictionaryCache.set(word, JSON.stringify(dictionaryResponse.payload));
		}

		return dictionaryResponse;
	}

	private dictionaryEntryExists(entry: IDictionaryEntry): boolean {
		return [
			Boolean(entry.getPartOfSpeech().length),
			Boolean(entry.getMeanings().length),
			Boolean(Object.keys(entry.getWordForms()).length),
		].some((entry) => entry);
	}

	private handleInValidWordError(): InvalidWord {
		return {
			message: 'The word must have a value',
		};
	}

	private handleApplicationError(): ApplicationError {
		return {
			message: 'An unexpected error occured',
		};
	}
}
