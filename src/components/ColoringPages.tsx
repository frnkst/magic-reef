const sheets = [
  { id: 'sunny', name: 'Sunny', description: 'A stripe for every favorite color.' },
  { id: 'pickle', name: 'Pickle', description: 'A little round fish with lots of spots.' },
  { id: 'peaches', name: 'Peaches', description: 'Big flowing fins. Bigger imagination.' },
  { id: 'ziggy', name: 'Ziggy', description: 'Zigzags for a very zigzaggy personality.' },
  { id: 'pip', name: 'Pip', description: 'Small in name. Big in possibility.' },
  { id: 'bubbles', name: 'Bubbles', description: 'Round, cheerful, and ready for color.' },
];

export function ColoringPages() {
  return (
    <main className="coloring-page">
      <header className="coloring-header">
        <a className="logo" href="/">magic reef.</a>
        <a className="text-button" href="/">Back to the aquarium ↗</a>
      </header>
      <section className="coloring-intro">
        <span className="eyebrow">A little paper ocean</span>
        <h1>Just add <em>their colors.</em></h1>
        <p>Six new friends, ready for crayons. Bold outlines, clear eyes, and unmistakable tails help the AI find the whole fish.</p>
        <div className="coloring-actions">
          <button className="button button-primary" onClick={() => window.print()}>Print all six fish <span aria-hidden="true">↗</span></button>
          <span>Landscape A4 · one fish per page · black &amp; white</span>
        </div>
        <p className="coloring-instructions">Choose A4, landscape, and 100% scale in the print dialog. Turn browser headers and footers off. To save a PDF, choose “Save as PDF” as the printer. Color inside the outline, leave the paper around the fish white, and photograph just one fish from straight above in good light.</p>
      </section>
      <div className="coloring-sheets">
        {sheets.map((sheet, index) => (
          <article className="coloring-sheet" key={sheet.id}>
            <div className="sheet-heading">
              <div><span className="eyebrow">0{index + 1} / Magic Reef</span><h2>{sheet.name}</h2></div>
              <a className="text-button sheet-download" href={`/coloring/${sheet.id}.svg`} download={`${sheet.id}-coloring.svg`}>Download this fish ↓</a>
            </div>
            <img src={`/coloring/${sheet.id}.svg`} alt={`${sheet.name}: an original black-outline fish for coloring`} width="800" height="460" />
            <footer className="sheet-footer"><span>{sheet.description}</span><span>Color the fish. Leave the outside paper white.</span></footer>
          </article>
        ))}
      </div>
    </main>
  );
}
