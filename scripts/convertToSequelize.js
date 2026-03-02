import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesDir = path.join(__dirname, '../routes');
const servicesDir = path.join(__dirname, '../services');

const replacements = [
  // Import Op
  { from: /^(import .+ from ['"]sequelize['"];?\s*)$/gm, to: "$1\nimport { Op } from 'sequelize';\n", condition: (content) => !content.includes("import { Op }") && content.includes("$") },
  
  // find() -> findAll()
  { from: /\.find\(\{/g, to: ".findAll({ where: {" },
  { from: /\.find\(\)/g, to: ".findAll()" },
  
  // findOne() with where
  { from: /\.findOne\(\{([^}]+)\}\)/g, to: ".findOne({ where: {$1} })" },
  
  // countDocuments() -> count()
  { from: /\.countDocuments\(\{/g, to: ".count({ where: {" },
  { from: /\.countDocuments\(\)/g, to: ".count()" },
  
  // $regex -> Op.iLike
  { from: /\{\s*\$regex:\s*([^,]+),\s*\$options:\s*['"]i['"]\s*\}/g, to: "{ [Op.iLike]: `%${$1}%` }" },
  { from: /\{\s*\$regex:\s*new RegExp\(([^,]+),\s*['"]i['"]\)\s*\}/g, to: "{ [Op.iLike]: `%${$1}%` }" },
  
  // $or -> Op.or
  { from: /\$or:/g, to: "[Op.or]:" },
  
  // $in -> Op.in
  { from: /\$in:/g, to: "[Op.in]:" },
  
  // $gt, $gte, $lt, $lte
  { from: /\$gte:/g, to: "[Op.gte]:" },
  { from: /\$gt:/g, to: "[Op.gt]:" },
  { from: /\$lte:/g, to: "[Op.lte]:" },
  { from: /\$lt:/g, to: "[Op.lt]:" },
  { from: /\$ne:/g, to: "[Op.ne]:" },
  
  // .sort() -> order
  { from: /\.sort\(\{\s*createdAt:\s*-1\s*\}\)/g, to: ", order: [['createdAt', 'DESC']]" },
  { from: /\.sort\(\{\s*([^:]+):\s*-1\s*\}\)/g, to: ", order: [['$1', 'DESC']]" },
  { from: /\.sort\(\{\s*([^:]+):\s*1\s*\}\)/g, to: ", order: [['$1', 'ASC']]" },
  
  // .limit() and .skip()
  { from: /\.limit\(([^)]+)\)\.skip\(([^)]+)\)/g, to: ", limit: $1, offset: $2" },
  { from: /\.skip\(([^)]+)\)\.limit\(([^)]+)\)/g, to: ", limit: $2, offset: $1" },
  
  // .populate() -> include
  { from: /\.populate\([^)]+\)/g, to: "" },
  
  // .lean()
  { from: /\.lean\(\)/g, to: "" },
  
  // .select()
  { from: /\.select\([^)]+\)/g, to: "" },
  
  // findByIdAndUpdate -> update with where id
  { from: /\.findByIdAndUpdate\(([^,]+),\s*\{([^}]+)\}/g, to: ".update({$2}, { where: { id: $1 } }" },
  
  // findByIdAndDelete -> destroy
  { from: /\.findByIdAndDelete\(([^)]+)\)/g, to: ".destroy({ where: { id: $1 } })" },
  
  // updateMany -> update
  { from: /\.updateMany\(/g, to: ".update(" },
  
  // findById -> findByPk
  { from: /\.findById\(/g, to: ".findByPk(" }
];

function convertFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Check if file has MongoDB syntax
    if (!content.includes('$') && !content.includes('.find(') && !content.includes('countDocuments')) {
      return false;
    }
    
    for (const replacement of replacements) {
      if (replacement.condition && !replacement.condition(content)) {
        continue;
      }
      
      const newContent = content.replace(replacement.from, replacement.to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Converted: ${path.basename(filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error converting ${filePath}:`, error.message);
    return false;
  }
}

function convertDirectory(dir) {
  const files = fs.readdirSync(dir);
  let converted = 0;
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      converted += convertDirectory(filePath);
    } else if (file.endsWith('.js')) {
      if (convertFile(filePath)) {
        converted++;
      }
    }
  }
  
  return converted;
}

console.log('🔄 Converting MongoDB syntax to Sequelize...\n');

const routesConverted = convertDirectory(routesDir);
console.log(`\n📁 Routes: ${routesConverted} files converted`);

console.log('\n✅ Conversion complete!');
