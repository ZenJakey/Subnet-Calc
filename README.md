# Visual Subnet Calculator - IPv4 & IPv6

A modern, responsive web application for visualizing and designing network subnets for both IPv4 and IPv6 networks. This tool allows network administrators to quickly split and join subnets, add notes and color coding, and collaborate by sharing custom links to their designs.

## Features

### Core Functionality
- **Dual Protocol Support**: Works with both IPv4 and IPv6 networks
- **Visual Subnet Management**: Interactive split/join interface with hierarchical display
- **Multiple Operating Modes**: Standard, AWS, Azure, and OCI modes with appropriate reserved address handling
- **Color Coding**: Apply colors to subnets for better visual organization
- **Notes System**: Add custom notes to any subnet
- **Export/Import**: Save and share subnet configurations
- **Shareable URLs**: Generate URLs to share your subnet designs

### IPv4 Features
- Support for /8 to /32 subnet sizes
- Automatic network boundary correction
- Standard reserved address handling (network + broadcast)
- Cloud provider specific reserved addresses

### IPv6 Features
- Support for /0 to /128 subnet sizes
- IPv6 address normalization and compression
- Proper IPv6 subnet calculations
- Large number formatting for host counts

### User Experience
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern UI**: Clean, intuitive interface built with Bootstrap 5
- **Real-time Validation**: Form validation with helpful error messages
- **Keyboard Shortcuts**: Press '/' to jump to network size field
- **Paste Support**: Paste CIDR notation directly into input fields

## Getting Started

### GitHub Pages Deployment

This project is designed to work with GitHub Pages. To deploy:

1. Fork or clone this repository
2. Enable GitHub Pages in your repository settings
3. Select the main branch as the source
4. Your site will be available at `https://yourusername.github.io/subnet-calc`

### Local Development

To run locally:

1. Clone the repository
2. Serve the files using a local web server (e.g., Python's `http.server` or Node.js `http-server`)
3. Open `index.html` in your browser

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000

Or just open the index.html
```

## Usage

### Basic Workflow

1. **Select IP Version**: Choose between IPv4 and IPv6
2. **Enter Network**: Input your network address and CIDR notation
3. **Choose Mode**: Select Standard, AWS, Azure, or OCI mode
4. **Click Go**: Initialize your subnet design
5. **Split Subnets**: Click the orange split buttons to divide subnets
6. **Join Subnets**: Click the blue join buttons to combine subnets
7. **Add Notes**: Click in the note column to add descriptions
8. **Apply Colors**: Use the color palette to highlight subnets
9. **Share**: Copy the shareable URL to collaborate

### Operating Modes

- **Standard**: Basic subnetting with network and broadcast address reservations
- **AWS**: Includes AWS-specific reserved addresses (VPC router, DNS, etc.)
- **Azure**: Includes Azure-specific reserved addresses (gateway, DNS, etc.)
- **OCI**: Includes Oracle Cloud Infrastructure reserved addresses

### Keyboard Shortcuts

- `/`: Jump from network address to network size field
- `Ctrl+V`: Paste CIDR notation (e.g., "10.0.0.0/24")

## Technical Details

### Architecture

- **Frontend**: Pure HTML, CSS, and JavaScript (no build process required)
- **Dependencies**: Bootstrap 5.3.0 (CDN)
- **Browser Support**: Modern browsers with ES6+ support
- **Responsive**: Mobile-first design with Bootstrap grid system

### IPv6 Implementation

The IPv6 implementation uses BigInt for accurate calculations with 128-bit addresses:

- Proper IPv6 address normalization and compression
- Support for all valid IPv6 address formats
- Accurate subnet calculations for large address spaces
- Optimized display formatting for readability

### Data Storage

- **Client-side Only**: No server-side storage
- **URL-based Sharing**: Configuration encoded in URL parameters
- **Export/Import**: JSON-based configuration format
- **Version Control**: Backward compatible configuration versions

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

### Development Guidelines

1. Maintain backward compatibility with existing configurations
2. Follow the existing code style and structure
3. Test on multiple browsers and devices
4. Ensure accessibility compliance
5. Update documentation for new features

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- Inspired by the original Visual Subnet Calculator by Caesar Kabalan
- Built with Bootstrap 5 for responsive design
- Uses modern web standards for optimal performance

## Support

For issues, questions, or feature requests, please use the GitHub Issues page.
