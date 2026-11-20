// ruleid: planr-no-raw-html
const a = <div dangerouslySetInnerHTML={{ __html: note }} />;
// ok: planr-no-raw-html
const b = <div>{note}</div>;
