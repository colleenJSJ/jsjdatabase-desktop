export default function TestTailwindPage() {
  return (
    <div className="min-h-screen bg-neutral-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-white">Tailwind CSS Test</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-neutral-800 p-6 rounded-lg border border-neutral-700">
            <h2 className="text-xl font-semibold text-white mb-2">Card 1</h2>
            <p className="text-neutral-400">This should have a dark background</p>
          </div>
          
          <div className="bg-primary-600 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-white mb-2">Primary Color</h2>
            <p className="text-primary-100">Using our custom primary color</p>
          </div>
          
          <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 p-6 rounded-lg border border-neutral-700">
            <h2 className="text-xl font-semibold text-white mb-2">Gradient</h2>
            <p className="text-neutral-400">Gradient background test</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors">
            Primary Button
          </button>
          
          <button className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-md transition-colors ml-4">
            Secondary Button
          </button>
        </div>
        
        <div className="bg-neutral-800 p-6 rounded-lg border border-neutral-700">
          <h3 className="text-lg font-medium text-white mb-4">Our Custom Colors:</h3>
          <div className="grid grid-cols-6 gap-2">
            <div className="bg-medical h-12 rounded flex items-center justify-center text-xs text-white">Medical</div>
            <div className="bg-travel h-12 rounded flex items-center justify-center text-xs text-white">Travel</div>
            <div className="bg-household h-12 rounded flex items-center justify-center text-xs text-white">Household</div>
            <div className="bg-personal h-12 rounded flex items-center justify-center text-xs text-white">Personal</div>
            <div className="bg-pets h-12 rounded flex items-center justify-center text-xs text-white">Pets</div>
            <div className="bg-urgent h-12 rounded flex items-center justify-center text-xs text-white">Urgent</div>
          </div>
        </div>
      </div>
    </div>
  );
}