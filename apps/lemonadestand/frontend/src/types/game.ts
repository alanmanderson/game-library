// ============================================================
// Lemonade Stand Tycoon - Game Types (matching backend API DTOs)
// ============================================================

export interface GameState {
  id: string;
  playerName: string;
  cash: number;
  totalRevenue: number;
  totalExpenses: number;
  day: number;
  stage: string;
  reputation: number;
  customersServed: number;
  cupsSold: number;
  isGameOver: boolean;
  gameOverReason?: string;
  createdAt: string;
  updatedAt: string;
  inventory: Inventory;
  stands: Stand[];
  recipes: Recipe[];
  employees: Employee[];
  achievements: Achievement[];
  activeEvents: GameEvent[];
  permits: Permit[];
  cityEvents: CityEvent[];
}

export interface Inventory {
  cups: number;
  lemons: number;
  sugar: number;
  ice: number;
  water: number;
}

export interface Stand {
  id: string;
  name: string;
  locationType: string;
  locationName: string;
  footTraffic: number;
  rent: number;
  hasPermit: boolean;
  isOpen: boolean;
  level: number;
  pricePerCup: number;
  recipeId: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  waterRatio: number;
  lemonRatio: number;
  sugarRatio: number;
  iceRatio: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  wage: number;
  skill: number;
  satisfaction: number;
  daysEmployed: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  isUnlocked: boolean;
  icon: string;
  unlockedAt?: string;
}

export interface DayResult {
  day: number;
  revenue: number;
  expenses: number;
  profit: number;
  customerCount: number;
  cupsSold: number;
  customerSatisfaction: number;
  weather: string;
  temperature: number;
  season: string;
  events: string[];
  notifications: string[];
  newAchievements: Achievement[];
  inventoryRanOut: boolean;
  cashAfter: number;
  newStageReached?: string;
}

export interface GameEvent {
  type: string;
  title: string;
  description: string;
  duration: number;
  impactMultiplier: number;
  isActive: boolean;
}

export interface CityEvent {
  title: string;
  description: string;
  affectedLocationType: string;
  trafficMultiplier: number;
  duration: number;
  isActive: boolean;
}

export interface Permit {
  type: string;
  cost: number;
  isActive: boolean;
}

export interface SupplyPrices {
  cupsPerPack: number;
  lemonsPerPound: number;
  sugarPerPound: number;
  icePerPound: number;
  waterPerGallon: number;
  cupsPerPack_Count: number;
}

export interface LocationOption {
  name: string;
  type: string;
  footTraffic: number;
  dailyRent: number;
  requiresPermit: boolean;
  buildCost: number;
  description: string;
}

export interface GameListItem {
  id: string;
  playerName: string;
  day: number;
  cash: number;
  stage: string;
  isGameOver: boolean;
  createdAt: string;
  updatedAt: string;
}

// Weather display helpers
export const WeatherIcons: Record<string, string> = {
  Sunny: '\u2600\uFE0F',
  Cloudy: '\u2601\uFE0F',
  PartlyCloudy: '\u26C5',
  Rainy: '\uD83C\uDF27\uFE0F',
  Stormy: '\u26C8\uFE0F',
  Snowy: '\u2744\uFE0F',
  Heatwave: '\uD83D\uDD25',
  Hurricane: '\uD83C\uDF0A',
  Cold: '\uD83E\uDD76',
};

export const WeatherNames: Record<string, string> = {
  Sunny: 'Sunny',
  Cloudy: 'Cloudy',
  PartlyCloudy: 'Partly Cloudy',
  Rainy: 'Rainy',
  Stormy: 'Stormy',
  Snowy: 'Snowy',
  Heatwave: 'Heatwave',
  Hurricane: 'Hurricane',
  Cold: 'Cold',
};

export const StageNames: Record<string, string> = {
  NeighborhoodStand: 'Neighborhood Stand',
  MultipleStands: 'Multiple Stands',
  PermitsAndRegulations: 'Permits & Regulations',
  BrickAndMortar: 'Brick & Mortar',
  MultiStoreChain: 'Multi-Store Chain',
  FranchiseModel: 'Franchise Empire',
  StateExpansion: 'State Expansion',
  NationalChain: 'National Chain',
  InternationalEmpire: 'International Empire',
  GlobalDomination: 'Global Domination',
};

export const EmployeeRoleNames: Record<string, string> = {
  Cashier: 'Cashier',
  Cook: 'Cook',
  Manager: 'Manager',
  Marketer: 'Marketer',
  Accountant: 'Accountant',
};

export const LocationTypeNames: Record<string, string> = {
  Residential: 'Residential',
  Park: 'Park',
  Downtown: 'Downtown',
  School: 'School',
  Beach: 'Beach',
  Mall: 'Mall',
  SportVenue: 'Sport Venue',
  Highway: 'Highway',
  SuburbanStrip: 'Suburban Strip',
};
