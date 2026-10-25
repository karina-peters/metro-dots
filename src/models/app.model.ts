export type View = {
  render: () => void;
  pause?: () => void;
  route?: string;
};
