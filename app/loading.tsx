export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-outline-variant/30">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-surface-container-high rounded-md"></div>
          <div className="h-4 w-40 bg-surface-container rounded-md"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-surface-container-high rounded-lg"></div>
          <div className="h-9 w-32 bg-surface-container-high rounded-lg"></div>
        </div>
      </div>

      {/* Cards summary skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest flex flex-col justify-between h-28 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-surface-container rounded"></div>
              <div className="w-8 h-8 rounded-lg bg-surface-container"></div>
            </div>
            <div className="h-7 w-20 bg-surface-container-high rounded"></div>
          </div>
        ))}
      </div>

      {/* Table / Content area skeleton */}
      <div className="p-5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="h-9 w-72 bg-surface-container rounded-lg"></div>
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-surface-container rounded-lg"></div>
            <div className="h-9 w-24 bg-surface-container rounded-lg"></div>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              className="h-12 w-full bg-surface-container/50 rounded-lg flex items-center px-4 gap-4"
            >
              <div className="w-6 h-6 rounded-full bg-surface-container-high"></div>
              <div className="h-4 w-1/4 bg-surface-container-high rounded"></div>
              <div className="h-4 w-1/6 bg-surface-container rounded"></div>
              <div className="h-4 w-1/5 bg-surface-container rounded hidden md:block"></div>
              <div className="h-4 w-16 bg-surface-container rounded ml-auto"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
