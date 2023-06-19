export interface RoomConfig {
    id: string;
    coinCount: number;
    area: Area;
  }
  
  export interface Area {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    zmin: number;
    zmax: number;
  }