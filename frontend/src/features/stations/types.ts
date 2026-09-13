export interface Station {
  id: string;
  name: string;
  active: boolean;
}

export interface CreateStationInput {
  name: string;
}

export interface UpdateStationInput {
  name?: string;
  active?: boolean;
}
