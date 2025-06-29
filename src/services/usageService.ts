import {
  getTokenUsageByDateRange,
  getTotalTokenUsage,
  TokenUsage,
} from '@/lib/indexDB';

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  models: string[];
  modelUsage: ModelUsage[];
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalRequests: number;
  dailyUsage: DailyUsage[];
}

// 날짜 범위별 토큰 사용량 데이터 가져오기
export const fetchUsageData = async (days: number = 7): Promise<DailyUsage[]> => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);

    const endDateStr = endDate.toISOString().split('T')[0];
    const startDateStr = startDate.toISOString().split('T')[0];

    const usageRecords = await getTokenUsageByDateRange(startDateStr, endDateStr);

    // 날짜별로 그룹화
    const dailyUsageMap = new Map<string, DailyUsage>();

    // 빈 날짜들 먼저 초기화
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      dailyUsageMap.set(dateStr, {
        date: dateStr,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        models: [],
        modelUsage: [],
      });
    }

    // 실제 사용량 데이터로 업데이트
    usageRecords.forEach((record) => {
      const existing = dailyUsageMap.get(record.date);
      if (existing) {
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
        existing.totalTokens += record.totalTokens;
        existing.requestCount += record.requestCount;
        
        if (!existing.models.includes(record.model)) {
          existing.models.push(record.model);
        }

        // 모델별 사용량 추가
        let modelUsage = existing.modelUsage.find(m => m.model === record.model);
        if (!modelUsage) {
          modelUsage = {
            model: record.model,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            requestCount: 0,
          };
          existing.modelUsage.push(modelUsage);
        }

        modelUsage.inputTokens += record.inputTokens;
        modelUsage.outputTokens += record.outputTokens;
        modelUsage.totalTokens += record.totalTokens;
        modelUsage.requestCount += record.requestCount;
      }
    });

    // Map을 배열로 변환하고 날짜순 정렬
    return Array.from(dailyUsageMap.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  } catch (error) {
    console.error('Error fetching usage data:', error);
    throw error;
  }
};

// 전체 사용량 요약 가져오기
export const fetchUsageSummary = async (days: number = 7): Promise<UsageSummary> => {
  try {
    const [totalUsage, dailyUsage] = await Promise.all([
      getTotalTokenUsage(),
      fetchUsageData(days),
    ]);

    return {
      ...totalUsage,
      dailyUsage,
    };
  } catch (error) {
    console.error('Error fetching usage summary:', error);
    throw error;
  }
};

// 특정 날짜의 상세 사용량 가져오기
export const fetchDailyUsageDetail = async (date: string): Promise<TokenUsage[]> => {
  try {
    const usageRecords = await getTokenUsageByDateRange(date, date);
    return usageRecords;
  } catch (error) {
    console.error('Error fetching daily usage detail:', error);
    throw error;
  }
};
