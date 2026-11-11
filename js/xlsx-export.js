/* Small dependency-free XLSX writer for private, browser-only admin exports. */
(function(root){
  const encoder=new TextEncoder();
  const CRC_TABLE=(()=>{
    const table=new Uint32Array(256);
    for(let i=0;i<256;i++){let value=i;for(let bit=0;bit<8;bit++)value=(value&1)?(value>>>1)^0xedb88320:value>>>1;table[i]=value>>>0}
    return table;
  })();
  const xmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&0xff]^(value>>>8);return(value^0xffffffff)>>>0};
  const uint16=value=>Uint8Array.of(value&255,(value>>>8)&255);
  const uint32=value=>Uint8Array.of(value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255);
  const join=parts=>{const total=parts.reduce((sum,part)=>sum+part.length,0),result=new Uint8Array(total);let offset=0;parts.forEach(part=>{result.set(part,offset);offset+=part.length});return result};
  const columnLabel=index=>{let label='';for(let value=index+1;value;value=Math.floor((value-1)/26))label=String.fromCharCode(65+(value-1)%26)+label;return label};
  function zipStore(files){
    let offset=0;const local=[],central=[];
    files.forEach(file=>{
      const name=encoder.encode(file.name),data=encoder.encode(file.text),crc=crc32(data);
      const header=join([uint32(0x04034b50),uint16(20),uint16(0),uint16(0),uint16(0),uint16(0),uint32(crc),uint32(data.length),uint32(data.length),uint16(name.length),uint16(0),name,data]);
      local.push(header);
      central.push(join([uint32(0x02014b50),uint16(20),uint16(20),uint16(0),uint16(0),uint16(0),uint16(0),uint32(crc),uint32(data.length),uint32(data.length),uint16(name.length),uint16(0),uint16(0),uint16(0),uint16(0),uint32(0),uint32(offset),name]));
      offset+=header.length;
    });
    const centralBytes=join(central);
    return join([...local,centralBytes,uint32(0x06054b50),uint16(0),uint16(0),uint16(files.length),uint16(files.length),uint32(centralBytes.length),uint32(offset),uint16(0)]);
  }
  function cellXml(value,row,column){
    const ref=columnLabel(column)+(row+1);
    if(typeof value==='number'&&Number.isFinite(value))return`<c r="${ref}"><v>${value}</v></c>`;
    return`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }
  function worksheetXml(rows){
    return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((cells,row)=>`<row r="${row+1}">${cells.map((value,column)=>cellXml(value,row,column)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  }
  function normalizedSheets(sheets){
    if(!Array.isArray(sheets)||!sheets.length)throw new Error('Excel export needs at least one sheet.');
    const used=new Set();
    return sheets.map((sheet,index)=>{
      if(!sheet||!Array.isArray(sheet.rows)||!sheet.rows.length)throw new Error('Every Excel sheet needs at least one row.');
      let name=String(sheet.name||`Sheet ${index+1}`).replace(/[\\/*?:\[\]]/g,' ').trim().slice(0,31)||`Sheet ${index+1}`;
      const base=name;let suffix=2;while(used.has(name)){name=`${base.slice(0,31-String(suffix).length-1)} ${suffix++}`}
      used.add(name);return{name,rows:sheet.rows};
    });
  }
  function xlsxBytesFromSheets(sheets){
    const cleanSheets=normalizedSheets(sheets),sheetOverrides=cleanSheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const workbookSheets=cleanSheets.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('');
    const relations=cleanSheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('');
    return zipStore([
      {name:'[Content_Types].xml',text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
      {name:'_rels/.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations}<Relationship Id="rId${cleanSheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'xl/styles.xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>'},
      ...cleanSheets.map((sheet,index)=>({name:`xl/worksheets/sheet${index+1}.xml`,text:worksheetXml(sheet.rows)})),
    ]);
  }
  const xlsxBytes=(rows,sheetName='Sheet 1')=>xlsxBytesFromSheets([{name:sheetName,rows}]);
  const api={xlsxBytes,xlsxBytesFromSheets,xmlEscape,columnLabel};
  if(typeof module!=='undefined')module.exports=api;
  else root.DKXlsx=api;
})(typeof window==='undefined'?globalThis:window);
