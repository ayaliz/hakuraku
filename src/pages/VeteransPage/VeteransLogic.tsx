import { Veteran, BaseFilter, SortOption, SortDirection } from "./types";
import { aggregateFactors, getFactorCategory } from "../../data/VeteransHelper";
import { getCardName } from "./VeteransUIHelper";


export const matchesFilter = (veteran: Veteran, filter: BaseFilter, categoryId: number): boolean => {
    const aggregated = aggregateFactors(veteran);
    const relevantFactors = aggregated.filter(f => getFactorCategory(f.factorId) === categoryId);
    const matchingFactors = relevantFactors.filter(f => f.name === filter.stat);

    if (filter.type === 'Legacy') {
        const goldStars = matchingFactors.filter(f => f.isGold).reduce((sum, f) => sum + f.level, 0);
        return goldStars >= filter.stars;
    } else {
        const totalStars = matchingFactors.reduce((sum, f) => sum + f.level, 0);
        return totalStars >= filter.stars;
    }
};

export const calculateSortScore = (veteran: Veteran, sortMode: SortOption): number => {
    const aggregated = aggregateFactors(veteran);
    
    const sumStars = (condition: (f: typeof aggregated[0]) => boolean) => {
        return aggregated.filter(condition).reduce((acc, curr) => acc + curr.level, 0);
    };

    switch (sortMode) {
        case 'blues': return sumStars(f => f.category === 1);
        case 'total_common': return sumStars(f => f.category === 4 || f.category === 5);
        case 'total_skills': return sumStars(f => f.category === 5);
        case 'legacy_common': return sumStars(f => (f.category === 4 || f.category === 5) && f.isGold);
        case 'legacy_skills': return sumStars(f => f.category === 5 && f.isGold);
        case 'date': return new Date(veteran.create_time).getTime();
        case 'none': default: return 0;
    }
};

export const getAvailableStats = (veterans: Veteran[], categoryId: number): string[] => {
    const statToMinFactorId = new Map<string, number>();

    veterans.forEach(veteran => {
        const aggregated = aggregateFactors(veteran);
        aggregated
            .filter(f => getFactorCategory(f.factorId) === categoryId)
            .forEach(f => {
                const currentMin = statToMinFactorId.get(f.name);
                if (currentMin === undefined || f.factorId < currentMin) {
                    statToMinFactorId.set(f.name, f.factorId);
                }
            });
    });

    const stats = Array.from(statToMinFactorId.keys());
    if (categoryId === 1 || categoryId === 2) {
        return stats.sort((a, b) => {
            const idA = statToMinFactorId.get(a)!;
            const idB = statToMinFactorId.get(b)!;
            return idA - idB;
        });
    }
    return stats.sort();
};

export const applyFiltersAndSort = (
    veterans: Veteran[],
    filters: {
        blues: BaseFilter[],
        aptitude: BaseFilter[],
        uniques: BaseFilter[],
        races: BaseFilter[],
        skills: BaseFilter[]
    },
    config: any,
    sort: SortOption,
    direction: SortDirection,
    nameSearch?: string
): Veteran[] => {
    let result = veterans;

    if (nameSearch && nameSearch.trim()) {
        const query = nameSearch.trim().toLowerCase();
        result = result.filter(v => getCardName(v.card_id).toLowerCase().includes(query));
    }

    const hasFilters = Object.values(filters).some(arr => arr.length > 0);

    if (hasFilters) {
        result = result.filter(veteran =>
            filters.blues.every(f => matchesFilter(veteran, f, config.blues.categoryId)) &&
            filters.aptitude.every(f => matchesFilter(veteran, f, config.aptitude.categoryId)) &&
            filters.uniques.every(f => matchesFilter(veteran, f, config.uniques.categoryId)) &&
            filters.races.every(f => matchesFilter(veteran, f, config.races.categoryId)) &&
            filters.skills.every(f => matchesFilter(veteran, f, config.skills.categoryId))
        );
    }

    if (sort !== 'none') {
        result.sort((a, b) => {
            const scoreA = calculateSortScore(a, sort);
            const scoreB = calculateSortScore(b, sort);
            if (scoreB !== scoreA) {
                return direction === 'desc' ? scoreB - scoreA : scoreA - scoreB;
            }
            return direction === 'desc' ? b.card_id - a.card_id : a.card_id - b.card_id;
        });
    }
    return result;
};